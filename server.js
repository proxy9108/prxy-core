const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');

const { db, audit } = require('./lib/store');
const auth = require('./lib/auth');
const pg = require('./lib/pg');
const obs = require('./lib/observe');
const dashboards = require('./lib/dashboards');
const checks = require('./lib/checks');
const pve = require('./lib/pve');
const actions = require('./lib/actions');
const security = require('./lib/security');
const netview = require('./lib/netview');
const bridge = require('./lib/bridge');
const ifstats = require('./lib/ifstats');
const fwwatch = require('./lib/fwwatch');
const unifistats = require('./lib/unifistats');
const { GUESTS, EXTRA_LINKS, BENIGN } = require('./lib/services');

const PORT = Number(process.env.PORT || 8443);
const TLS_DIR = process.env.TLS_DIR || '/etc/prxy-core/tls';
const SNAPSHOT_EVERY_MS = 60 * 60 * 1000;

const app = express();
app.set('trust proxy', false);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '64kb' }));
app.use('/api', auth.requireAppHeader);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts - wait 15 minutes' } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

const ip = (req) => req.socket.remoteAddress;
const str = (v, max = 200) => (typeof v === 'string' && v.length <= max ? v : null);

// Wraps async handlers so thrown errors become JSON responses. Postgres error
// messages are shown as-is: the user is the admin and needs them to fix SQL.
const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  const status = e.status || (e.code ? 400 : 500);
  if (status === 500) console.error(e);
  res.status(status).json({ error: e.message || 'Server error', code: e.code });
});

// ---------- first-run setup ----------
let pendingTotp = null; // { secret } held in memory until setup finishes

// Counts-only metrics for Prometheus -> Homepage tiles. Prometheus host only, no login (lib/metrics.js).
app.get('/metrics', require('./lib/metrics').handler);

app.get('/api/state', (req, res) => {
  const user = auth.sessionUser(req);
  res.json({ setup: !auth.hasUsers(), user: user ? { username: user.username } : null });
});

app.post('/api/setup/start', loginLimiter, h(async (req, res) => {
  if (!auth.checkSetupToken(req.body.token)) return res.status(403).json({ error: 'Invalid setup token' });
  pendingTotp = { secret: auth.authenticator.generateSecret() };
  const uri = auth.authenticator.keyuri('admin', 'Prxy Core', pendingTotp.secret);
  res.json({ qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }), secret: pendingTotp.secret });
}));

app.post('/api/setup/finish', loginLimiter, h(async (req, res) => {
  const { token, username, password, code } = req.body;
  if (!auth.checkSetupToken(token)) return res.status(403).json({ error: 'Invalid setup token' });
  if (!pendingTotp) return res.status(400).json({ error: 'Start setup first' });
  const name = str(username, 40);
  if (!name || !/^[a-zA-Z0-9_.-]{3,40}$/.test(name)) return res.status(400).json({ error: 'Username: 3-40 letters, numbers, . _ -' });
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    return res.status(400).json({ error: 'Password must be at least 12 characters' });
  }
  if (!auth.authenticator.check(String(code || '').replace(/\s/g, ''), pendingTotp.secret)) {
    return res.status(400).json({ error: 'That code does not match - check the time on your phone' });
  }
  auth.createUser(name, password, pendingTotp.secret);
  pendingTotp = null;
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(name);
  auth.setSessionCookie(res, auth.createSession(user.id));
  audit({ username: name, action: 'setup', detail: 'admin account created', ip: ip(req) });
  res.json({ ok: true });
}));

// ---------- sessions ----------
app.post('/api/login', loginLimiter, (req, res) => {
  const name = str(req.body.username, 40);
  const user = name && auth.verifyLogin(name, str(req.body.password), str(req.body.code, 12));
  audit({ username: name, action: 'login', ok: !!user, ip: ip(req) });
  if (!user) return res.status(401).json({ error: 'Wrong username, password or code' });
  auth.setSessionCookie(res, auth.createSession(user.id));
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const user = auth.sessionUser(req);
  auth.destroySession(auth.readCookie(req));
  auth.clearSessionCookie(res);
  if (user) audit({ username: user.username, action: 'logout', ip: ip(req) });
  res.json({ ok: true });
});

// Everything below needs a signed-in user.
const api = express.Router();
api.use(auth.requireAuth);
app.use('/api', api);

// ---------- databases ----------
api.get('/databases', h(async (req, res) => {
  const dbs = await pg.listDatabases();
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const hist = db.prepare('SELECT ts, database, bytes FROM size_snapshots WHERE ts >= ? ORDER BY ts').all(since);
  res.json({ databases: dbs.map((d) => ({ ...d, history: hist.filter((x) => x.database === d.name).map((x) => [x.ts, x.bytes]) })) });
}));

api.get('/databases/:db/tables', h(async (req, res) => {
  res.json({ tables: await pg.listTables(req.params.db) });
}));

api.get('/databases/:db/tables/:schema/:table', h(async (req, res) => {
  res.json(await pg.describeTable(req.params.db, req.params.schema, req.params.table));
}));

api.get('/databases/:db/tables/:schema/:table/rows', h(async (req, res) => {
  const { db: database, schema, table } = req.params;
  const unmask = req.query.unmask === '1';
  const r = await pg.browseTable(database, schema, table, { ...req.query, unmask });
  if (unmask) audit({ username: req.user.username, action: 'unmask', target: `${database}/${schema}.${table}`, rows: r.rows.length, ip: ip(req) });
  res.json(r);
}));

api.post('/databases/:db/query', h(async (req, res) => {
  const database = req.params.db;
  const sql = str(req.body.sql, 20000);
  const unmask = req.body.unmask === true;
  try {
    const r = await pg.runQuery(database, sql, { unmask });
    audit({ username: req.user.username, action: unmask ? 'query+unmask' : 'query', target: database,
      detail: sql, rows: r.rows.length, ms: r.ms, ip: ip(req) });
    res.json(r);
  } catch (e) {
    audit({ username: req.user.username, action: 'query', target: database, detail: sql,
      ms: e.ms, ok: false, ip: ip(req) });
    throw e;
  }
}));

// ---------- saved queries ----------
api.get('/saved-queries', (req, res) => {
  res.json({ queries: db.prepare('SELECT * FROM saved_queries ORDER BY name').all() });
});

api.post('/saved-queries', (req, res) => {
  const name = str(req.body.name, 100);
  const database = str(req.body.database, 63);
  const sql = str(req.body.sql, 20000);
  if (!name || !name.trim() || !database || !sql || !sql.trim()) return res.status(400).json({ error: 'Name, database and SQL are required' });
  const r = db.prepare('INSERT INTO saved_queries (name, database, sql) VALUES (?, ?, ?)').run(name.trim(), database, sql);
  audit({ username: req.user.username, action: 'save-query', target: database, detail: name.trim(), ip: ip(req) });
  res.json({ id: r.lastInsertRowid });
});

api.delete('/saved-queries/:id', (req, res) => {
  const r = db.prepare('DELETE FROM saved_queries WHERE id = ?').run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'Not found' });
  audit({ username: req.user.username, action: 'delete-query', target: String(req.params.id), ip: ip(req) });
  res.json({ ok: true });
});

// ---------- infrastructure (Phase 2, read-only) ----------
const RANGES = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };
const rangeOf = (r) => RANGES[r] || RANGES['24h'];

api.get('/overview', h(async (req, res) => {
  res.json(await checks.statusBoard());
}));

api.get('/infra', h(async (req, res) => {
  const [infra, probes] = await Promise.all([obs.infrastructure(), obs.probeAll().catch(() => [])]);
  const probeByVmid = Object.fromEntries(probes.filter((p) => p.vmid).map((p) => [p.vmid, p]));
  infra.guests.forEach((g) => { g.probe = probeByVmid[g.vmid] || null; });
  res.json({ ...infra, links: EXTRA_LINKS.map((l) => ({ ...l, probe: probes.find((p) => p.url === l.url) || null })) });
}));

api.get('/infra/:vmid', h(async (req, res) => {
  const vmid = Number(req.params.vmid);
  const infra = await obs.infrastructure();
  const g = infra.guests.find((x) => x.vmid === vmid);
  if (!g) return res.status(404).json({ error: 'Unknown guest' });
  res.json({ guest: { ...g, directory: GUESTS[vmid] || null }, history: await obs.guestHistory(g.id, rangeOf(req.query.range)) });
}));

api.get('/docker', h(async (req, res) => {
  const [containers, history, live] = await Promise.all([
    obs.containers(), obs.containerHistory(rangeOf(req.query.range)),
    bridge.configured() ? bridge.list().then((value) => ({ value }), (e) => ({ error: e.message })) : Promise.resolve(null),
  ]);
  const byName = live && live.value ? Object.fromEntries(live.value.map((c) => [c.name, c])) : {};
  res.json({
    containers: containers.map((c) => {
      const b = byName[c.name];
      return { ...c, note: BENIGN[c.name] || null, health: b ? b.health : null, restartCount: b ? b.restartCount : null, restarting: b ? b.restarting : false, controlled: b ? b.controlled : false, state: b ? b.state : null, exitCode: b ? b.exitCode : null };
    }),
    history,
    bridge: { configured: bridge.configured(), ok: !!(live && live.value), error: live && live.error ? live.error : null },
    critical: CRITICAL_CONTAINERS,
  });
}));


api.get('/monitoring', h(async (req, res) => {
  const settle = (p) => p.then((value) => ({ value }), (e) => ({ error: e.message }));
  const [targets, rules, alerts, logs] = await Promise.all([
    settle(obs.targets()), settle(obs.ruleCount()), settle(obs.alerts()), settle(obs.lokiFreshness())]);
  res.json({ targets, rules, alerts, logs });
}));

api.get('/dashboards/:name', h(async (req, res) => {
  res.json(await dashboards.get(req.params.name, rangeOf(req.query.range), req.query.ip));
}));

api.get('/logs/labels', h(async (req, res) => {
  res.json({ labels: await obs.lokiLabels() });
}));

api.post('/logs/query', h(async (req, res) => {
  const body = req.body || {};
  const labels = body.labels && typeof body.labels === 'object' ? body.labels : {};
  const query = obs.buildLogQL({ labels, contains: str(body.contains, 500), raw: str(body.raw, 2000) });
  const r = await obs.logs({ query, seconds: rangeOf(body.range), limit: body.limit });
  audit({ username: req.user.username, action: 'logs', target: 'loki', detail: query, rows: r.lines.length, ip: ip(req) });
  res.json(r);
}));

// ---------- actions (Phase 2b) ----------
// Anything that changes state needs a fresh authenticator code (step-up) and is audited.
const SELF_VMID = 136;
const actionLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many actions - wait a few minutes' } });

function stepUp(req, res) {
  if (auth.verifyStepUp(req.user.id, req.body && req.body.code)) return true;
  audit({ username: req.user.username, action: 'step-up', ok: false, ip: ip(req) });
  res.status(403).json({ error: 'Authenticator code required (or already used) - enter a fresh 6-digit code', stepUp: true });
  return false;
}

api.get('/actions/targets', (req, res) => {
  res.json({ targets: actions.targets(), services: actions.configured(), pve: pve.configured() });
});

api.post('/actions/service', actionLimiter, h(async (req, res) => {
  const { vmid, name, op } = req.body || {};
  const t = actions.findTarget(vmid, str(name, 100));
  if (!t) return res.status(404).json({ error: 'Not an allowlisted service' });
  if (!actions.OPS.includes(op)) return res.status(400).json({ error: 'Unsupported operation' });
  if (op === 'restart' && !stepUp(req, res)) return;
  const r = await actions.run(t.ip, op, t.name);
  audit({ username: req.user.username, action: `${t.kind}:${op}`, target: `${t.vmid}/${t.name}`,
    detail: op === 'restart' ? r.output.slice(0, 500) : null, ms: r.ms, ok: r.ok, ip: ip(req) });
  res.status(r.ok ? 200 : 502).json({ ...r, status: op === 'status' ? actions.parseStatus(r.output) : undefined, error: r.ok ? undefined : (r.output.trim() || 'Action failed') });
}));

api.post('/actions/guest', actionLimiter, h(async (req, res) => {
  const { vmid, op, confirm } = req.body || {};
  const id = Number(vmid);
  if (id === SELF_VMID) return res.status(400).json({ error: 'Prxy Core will not power-cycle its own container' });
  if (!['start', 'shutdown', 'reboot'].includes(op)) return res.status(400).json({ error: 'Unsupported operation' });
  const g = await pve.guestKind(id);
  if (op !== 'start' && confirm !== g.name) return res.status(400).json({ error: `Type the guest name (${g.name}) to confirm` });
  if (!stepUp(req, res)) return;
  try {
    const upid = await pve.power(id, op);
    audit({ username: req.user.username, action: `guest:${op}`, target: `${id}/${g.name}`, detail: upid, ip: ip(req) });
    res.json({ upid });
  } catch (e) {
    audit({ username: req.user.username, action: `guest:${op}`, target: `${id}/${g.name}`, detail: e.message, ok: false, ip: ip(req) });
    throw e;
  }
}));

api.get('/tasks/:upid', h(async (req, res) => {
  res.json(await pve.taskStatus(req.params.upid));
}));

// ---------- container control through the Docker bridge ----------
const CRITICAL_CONTAINERS = ['npm', 'cloudflared', 'autotrack-backend', 'autotrack-frontend', 'portainer', 'discord-bot'];

api.get('/containers/:name/logs', h(async (req, res) => {
  const text = await bridge.logs(req.params.name, req.query.tail);
  audit({ username: req.user.username, action: 'docker:logs', target: req.params.name, rows: text.split('\n').length, ip: ip(req) });
  res.json({ name: req.params.name, text });
}));

api.post('/actions/container', actionLimiter, h(async (req, res) => {
  const { name, op, confirm } = req.body || {};
  if (typeof name !== 'string' || !['restart', 'stop', 'start'].includes(op)) return res.status(400).json({ error: 'Bad request' });
  if (op !== 'start' && CRITICAL_CONTAINERS.includes(name) && confirm !== name) return res.status(400).json({ error: `Type ${name} to confirm - this container is critical` });
  if (!stepUp(req, res)) return;
  try {
    const r = await bridge.action(name, op);
    audit({ username: req.user.username, action: `docker:${op}`, target: name, detail: r.changed === false ? 'no change' : null, ip: ip(req) });
    res.json(r);
  } catch (e) {
    audit({ username: req.user.username, action: `docker:${op}`, target: name, detail: e.message, ok: false, ip: ip(req) });
    throw e;
  }
}));

// ---------- backups ----------
api.get('/backups', h(async (req, res) => {
  const [b, infra, app] = await Promise.all([
    pve.backups(),
    obs.infrastructure().catch(() => ({ guests: [] })),
    actions.listBackupDirs().catch((e) => ({ error: e.message })),
  ]);
  res.json({ ...b, guests: infra.guests.map((g) => ({ vmid: g.vmid, name: g.name, type: g.type, running: g.running })), app });
}));

api.post('/backups/run', actionLimiter, h(async (req, res) => {
  const id = Number(req.body && req.body.vmid);
  const g = await pve.guestKind(id);
  if (!stepUp(req, res)) return;
  const upid = await pve.backupNow(id);
  audit({ username: req.user.username, action: 'backup:run', target: `${id}/${g.name}`, detail: upid, ip: ip(req) });
  res.json({ upid });
}));

// ---------- power ----------
api.get('/power', h(async (req, res) => {
  res.json(await obs.power(rangeOf(req.query.range)));
}));

// ---------- security ----------
api.get('/security', h(async (req, res) => { res.json(await security.summary()); }));

// ---------- recon ----------
// Looks up an IP/domain/email/URL/hash/username: the lab's own data first, then public records (lib/recon.js).
// Audit keeps only the indicator TYPE, never the value (24-hour policy). Results are cached in memory only.
const recon = require('./lib/recon');
const reconLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many lookups - wait a minute' }) });
api.get('/recon', reconLimiter, h(async (req, res) => {
  const q = str(req.query.q, 300);
  if (!q || !q.trim()) return res.status(400).json({ error: 'Enter something to look up' });
  const t = Date.now();
  const r = await recon.lookup(q);
  audit({ username: req.user.username, action: 'recon', detail: r.type ? `${r.type} lookup${r.internal ? ' (internal)' : ''}` : 'unrecognised input', ms: Date.now() - t, ip: ip(req) });
  res.json(r);
}));
api.post('/recon/summary', reconLimiter, h(async (req, res) => {
  const q = str(req.body && req.body.q, 300);
  if (!q || !q.trim()) return res.status(400).json({ error: 'Nothing to explain' });
  const r = await recon.lookup(q); // served from the 10-minute memory cache after a lookup
  if (!r.type) return res.status(400).json({ error: 'Not recognised' });
  const t = Date.now();
  const out = await recon.summarize(r);
  audit({ username: req.user.username, action: 'recon-summary', detail: `${r.type} explained by local AI`, ms: Date.now() - t, ip: ip(req) });
  res.json(out);
}));
const exposure = require('./lib/exposure');
// Household exposure: own domains' mail security, expiry and certificate names (daily; domain facts only).
api.get('/exposure', h(async (req, res) => { res.json(exposure.summary()); }));
api.post('/exposure/refresh', reconLimiter, h(async (req, res) => {
  exposure.runAll();
  audit({ username: req.user.username, action: 'exposure-check', detail: 'manual re-check of own domains', ip: ip(req) });
  res.json({ started: true });
}));

api.post('/security/devices/ack', h(async (req, res) => {
  const body = req.body || {};
  const keys = Array.isArray(body.keys) ? body.keys.filter((k) => typeof k === 'string' && k.length <= 64) : [];
  if (!body.all && !keys.length) return res.status(400).json({ error: 'Nothing to acknowledge' });
  const n = security.acknowledge(keys, body.all === true);
  audit({ username: req.user.username, action: 'device:ack', target: body.all ? 'all' : `${keys.length} device(s)`, rows: n, ip: ip(req) });
  res.json({ acknowledged: n });
}));

// ---------- network ----------
api.get('/netview', h(async (req, res) => {
  res.json({ model: netview.staticModel(), live: await netview.snapshot(Number(req.query.window) || 300) });
}));

api.post('/network/rules/ack', h(async (req, res) => {
  const body = req.body || {};
  const keys = Array.isArray(body.keys) ? body.keys.filter((k) => typeof k === 'string' && k.length <= 200) : [];
  if (!body.all && !keys.length) return res.status(400).json({ error: 'Nothing to acknowledge' });
  const n = fwwatch.acknowledge(keys, body.all === true);
  audit({ username: req.user.username, action: 'fwrules:ack', target: body.all ? 'all' : `${keys.length} rule(s)`, rows: n, ip: ip(req) });
  res.json({ acknowledged: n });
}));

// ---------- health & audit ----------
api.get('/health', h(async (req, res) => {
  res.json({ ...(await pg.health()), ping_ms: await pg.ping() });
}));

api.get('/audit', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
  const action = str(req.query.action, 40);
  const rows = action
    ? db.prepare('SELECT * FROM audit WHERE action = ? ORDER BY id DESC LIMIT ?').all(action, limit)
    : db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit);
  res.json({ entries: rows });
});

api.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ---------- static SPA ----------
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: 0 }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- background: hourly size snapshots ----------
async function snapshotSizes() {
  try {
    const ts = Math.floor(Date.now() / 1000);
    const ins = db.prepare('INSERT OR IGNORE INTO size_snapshots (ts, database, bytes) VALUES (?, ?, ?)');
    const dbs = await pg.listDatabases();
    db.transaction(() => dbs.forEach((d) => ins.run(ts, d.name, d.bytes)))();
    db.prepare('DELETE FROM size_snapshots WHERE ts < ?').run(ts - 180 * 86400);
  } catch (e) {
    console.error('size snapshot failed:', e.message);
  }
}

const server = https.createServer({
  key: fs.readFileSync(path.join(TLS_DIR, 'key.pem')),
  cert: fs.readFileSync(path.join(TLS_DIR, 'cert.pem')),
}, app);

server.listen(PORT, () => {
  console.log(`Prxy Core listening on https://0.0.0.0:${PORT}`);
  const token = auth.getSetupToken();
  if (token) console.log(`First-run setup: open https://<this-host>:${PORT}/#/setup and enter token ${token}`);
  snapshotSizes();
  setInterval(snapshotSizes, SNAPSHOT_EVERY_MS).unref();
  security.startCollector();
  ifstats.start();
  fwwatch.start();
  exposure.start();
  unifistats.start();
});
