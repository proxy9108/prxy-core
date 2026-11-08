'use strict';
// Prxy Docker Bridge - the only thing Prxy Core may use to touch Docker on this host.
//
// What it can do: list containers (with health), read recent logs, and start/stop/restart
// containers named in CONTROLLED. What it cannot do (the code has no path for it): create,
// exec, pull, remove, volumes, networks, images, or anything else in the Docker API.
// Every request must (1) come from an allowed source address, (2) carry a fresh HMAC
// signature made with the shared secret, and (3) arrive over TLS.
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8098);
const SOCK = process.env.DOCKER_SOCK || '/var/run/docker.sock';
const SELF = process.env.SELF_NAME || 'prxy-docker-bridge';
const ALLOW_FROM = new Set((process.env.ALLOW_FROM || '').split(',').map((s) => s.trim()).filter(Boolean));
const CONTROLLED = new Set((process.env.CONTROLLED || '').split(',').map((s) => s.trim()).filter(Boolean));
const SECRET = fs.readFileSync(process.env.SECRET_FILE || '/run/bridge/secret', 'utf8').trim();
const TLS = { key: fs.readFileSync(process.env.TLS_KEY || '/run/bridge/key.pem'), cert: fs.readFileSync(process.env.TLS_CERT || '/run/bridge/cert.pem') };

if (SECRET.length < 32) throw new Error('BRIDGE secret must be at least 32 characters');
if (!ALLOW_FROM.size) throw new Error('ALLOW_FROM must list at least one source address');

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
const MAX_BODY = 4096;
const MAX_LOG_TAIL = 1000;
const MAX_LOG_BYTES = 768 * 1024;
const SKEW_MS = 30000;

// ---------- Docker over the unix socket (fixed set of calls only) ----------
function docker(method, path, timeoutMs = 20000, cap = MAX_LOG_BYTES * 2) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: SOCK, path, method, timeout: timeoutMs }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size <= cap) chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), truncated: size > cap }));
    });
    req.on('timeout', () => req.destroy(new Error('Docker did not answer in time')));
    req.on('error', reject);
    req.end();
  });
}

// Non-TTY containers return a multiplexed stream: 8-byte header (stream, 0,0,0, length BE) + payload.
function demux(buf) {
  const parts = []; let i = 0;
  while (i + 8 <= buf.length && buf[i] <= 2 && buf[i + 1] === 0 && buf[i + 2] === 0 && buf[i + 3] === 0) {
    const len = buf.readUInt32BE(i + 4);
    parts.push(buf.subarray(i + 8, Math.min(buf.length, i + 8 + len)).toString('utf8'));
    i += 8 + len;
  }
  return parts.length ? parts.join('') : buf.toString('utf8');
}

const nameOf = (d) => d.Name.replace(/^\//, '');

async function listContainers() {
  const r = await docker('GET', '/containers/json?all=1');
  if (r.status !== 200) throw new Error(`Docker list failed (${r.status})`);
  const items = JSON.parse(r.body.toString('utf8'));
  const details = await Promise.all(items.map(async (c) => {
    const x = await docker('GET', `/containers/${encodeURIComponent(c.Id)}/json`);
    return JSON.parse(x.body.toString('utf8'));
  }));
  return details.map((d) => {
    const name = nameOf(d);
    return {
      name, image: d.Config.Image, state: d.State.Status, running: !!d.State.Running, restarting: !!d.State.Restarting,
      health: d.State.Health ? d.State.Health.Status : null, restartCount: d.RestartCount,
      startedAt: d.State.StartedAt, finishedAt: d.State.FinishedAt, exitCode: d.State.ExitCode,
      controlled: CONTROLLED.has(name) && name !== SELF,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function containerLogs(name, tail) {
  const insp = await docker('GET', `/containers/${encodeURIComponent(name)}/json`);
  if (insp.status === 404) throw Object.assign(new Error('No such container'), { status: 404 });
  const tty = !!JSON.parse(insp.body.toString('utf8')).Config.Tty;
  const r = await docker('GET', `/containers/${encodeURIComponent(name)}/logs?stdout=1&stderr=1&timestamps=1&tail=${tail}`);
  if (r.status !== 200) throw new Error(`Docker logs failed (${r.status})`);
  let text = tty ? r.body.toString('utf8') : demux(r.body);
  if (text.length > MAX_LOG_BYTES) text = text.slice(-MAX_LOG_BYTES);
  return text;
}

async function control(name, op) {
  if (name === SELF) throw Object.assign(new Error('The bridge does not control itself'), { status: 403 });
  if (!CONTROLLED.has(name)) throw Object.assign(new Error('That container is not on the controlled list'), { status: 403 });
  const q = op === 'start' ? '' : '?t=10';
  const r = await docker('POST', `/containers/${encodeURIComponent(name)}/${op}${q}`, 40000, 64 * 1024);
  if (r.status === 404) throw Object.assign(new Error('No such container'), { status: 404 });
  if (r.status === 204) return { ok: true, changed: true };
  if (r.status === 304) return { ok: true, changed: false };
  throw new Error(`Docker ${op} failed (${r.status}): ${r.body.toString('utf8').slice(0, 200)}`);
}

// ---------- request authentication ----------
const seenNonces = new Map();
function sweepNonces() { const now = Date.now(); for (const [n, t] of seenNonces) if (now - t > 2 * SKEW_MS) seenNonces.delete(n); }
setInterval(sweepNonces, 30000).unref();

const hits = new Map();
function rateLimited(ip) {
  const minute = Math.floor(Date.now() / 60000);
  const h = hits.get(ip);
  if (!h || h.minute !== minute) { hits.set(ip, { minute, n: 1 }); return false; }
  return ++h.n > 120;
}

function authenticate(req, body) {
  const ts = Number(req.headers['x-bridge-ts']);
  const nonce = String(req.headers['x-bridge-nonce'] || '');
  const sig = String(req.headers['x-bridge-sig'] || '');
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SKEW_MS) return 'stale or missing timestamp';
  if (!/^[0-9a-f]{16,64}$/.test(nonce) || seenNonces.has(nonce)) return 'bad or reused nonce';
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const expected = crypto.createHmac('sha256', SECRET).update([req.method, req.url, ts, nonce, bodyHash].join('\n')).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'bad signature';
  seenNonces.set(nonce, Date.now());
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const send = (res, status, obj) => { const s = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(s); };

const server = https.createServer(TLS, async (req, res) => {
  const started = Date.now();
  const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
  let status = 500; let label = `${req.method} ${req.url.split('?')[0]}`;
  const finish = (st, obj) => { status = st; send(res, st, obj); };
  try {
    if (!ALLOW_FROM.has(ip)) return finish(403, { error: 'source not allowed' });
    if (rateLimited(ip)) return finish(429, { error: 'too many requests' });
    const body = await readBody(req);
    const bad = authenticate(req, body);
    if (bad) return finish(401, { error: bad });

    const url = new URL(req.url, 'https://bridge');
    const m = url.pathname.split('/').filter(Boolean); // v1, containers, name, op
    if (m[0] !== 'v1') return finish(404, { error: 'not found' });
    if (req.method === 'GET' && m[1] === 'ping' && m.length === 2) return finish(200, { ok: true, controlled: [...CONTROLLED] });
    if (req.method === 'GET' && m[1] === 'containers' && m.length === 2) return finish(200, { containers: await listContainers() });
    if (m[1] === 'containers' && m.length >= 3) {
      const name = m[2];
      if (!NAME_RE.test(name)) return finish(400, { error: 'bad container name' });
      if (req.method === 'GET' && m[3] === 'logs' && m.length === 4) {
        const tail = Math.min(Math.max(parseInt(url.searchParams.get('tail'), 10) || 200, 1), MAX_LOG_TAIL);
        return finish(200, { name, tail, text: await containerLogs(name, tail) });
      }
      if (req.method === 'POST' && ['restart', 'stop', 'start'].includes(m[3]) && m.length === 4) {
        label = `${m[3]} ${name}`;
        return finish(200, { name, op: m[3], ...(await control(name, m[3])) });
      }
    }
    return finish(404, { error: 'not found' });
  } catch (e) {
    finish(e.status || 500, { error: e.message });
  } finally {
    console.log(JSON.stringify({ t: new Date().toISOString(), ip, req: label, status, ms: Date.now() - started }));
  }
});

server.listen(PORT, () => console.log(JSON.stringify({ t: new Date().toISOString(), msg: 'bridge listening', port: PORT, allow: [...ALLOW_FROM], controlled: CONTROLLED.size })));
