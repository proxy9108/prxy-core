// Client for the Prxy Docker Bridge on LXC 110. TLS is fully verified against the bridge's own
// certificate (BRIDGE_CERT_FILE, used as the trust anchor, SAN = its IP) with its SHA-256
// fingerprint pinned on top; every request is signed with the shared secret (HMAC).
const fs = require('fs');
const https = require('https');
const tls = require('tls');
const crypto = require('crypto');

const HOST = process.env.BRIDGE_HOST || '10.20.40.110';
const PORT = Number(process.env.BRIDGE_PORT || 8098);
const SECRET = process.env.BRIDGE_SECRET;
const FINGERPRINT = (process.env.BRIDGE_FINGERPRINT || '').toUpperCase();
const CERT_FILE = process.env.BRIDGE_CERT_FILE || '/etc/prxy-core/tls/bridge-cert.pem';

let CA = null;
try { CA = fs.readFileSync(CERT_FILE); } catch { /* not installed yet */ }
const configured = () => Boolean(SECRET && FINGERPRINT && CA);

const agent = new https.Agent({
  keepAlive: true,
  ca: CA || undefined,
  checkServerIdentity: (host, cert) => {
    const err = tls.checkServerIdentity(HOST, cert);
    if (err) return err;
    if (cert.fingerprint256 !== FINGERPRINT) return new Error('Docker bridge certificate fingerprint mismatch - refusing to connect');
    return undefined;
  },
});

function request(method, path, timeoutMs = 20000) {
  if (!configured()) return Promise.reject(Object.assign(new Error('Docker bridge is not configured'), { status: 503 }));
  const body = '';
  const ts = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const sig = crypto.createHmac('sha256', SECRET).update([method, path, ts, nonce, bodyHash].join('\n')).digest('hex');
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: HOST, port: PORT, method, path, agent, timeout: timeoutMs,
      headers: { 'X-Bridge-Ts': String(ts), 'X-Bridge-Nonce': nonce, 'X-Bridge-Sig': sig, 'Content-Length': 0 },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* not JSON */ }
        if (res.statusCode >= 400) return reject(Object.assign(new Error((json && json.error) || `Bridge HTTP ${res.statusCode}`), { status: res.statusCode === 403 || res.statusCode === 404 ? res.statusCode : 502 }));
        resolve(json);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Docker bridge timeout')));
    req.on('error', reject);
    req.end();
  });
}

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
const checkName = (n) => { if (!NAME_RE.test(n)) throw Object.assign(new Error('Bad container name'), { status: 400 }); return n; };

module.exports = {
  configured,
  list: () => request('GET', '/v1/containers').then((r) => r.containers),
  logs: (name, tail = 200) => request('GET', `/v1/containers/${checkName(name)}/logs?tail=${Math.min(Math.max(parseInt(tail, 10) || 200, 1), 1000)}`).then((r) => r.text),
  action: (name, op) => {
    if (!['restart', 'stop', 'start'].includes(op)) throw Object.assign(new Error('Unsupported operation'), { status: 400 });
    return request('POST', `/v1/containers/${checkName(name)}/${op}`, 45000);
  },
};
