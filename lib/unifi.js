// Read-only client for the UniFi Network application (Cloud Key Gen2+). It signs in as the local
// `prxycore` account, whose UniFi role is "View Only" for Network, so the console itself refuses
// changes. The only non-GET request is the sign-in. TLS: the console's certificate is the trust
// anchor (UNIFI_CERT_FILE), its name (unifi.local) is checked, and its fingerprint is pinned.
const fs = require('fs');
const https = require('https');
const tls = require('tls');

const HOST = process.env.UNIFI_HOST || '10.20.40.105';
const SERVERNAME = process.env.UNIFI_SERVERNAME || 'unifi.local';
const CRED_FILE = process.env.UNIFI_CRED_FILE || '/etc/prxy-core/unifi.cred';
const CERT_FILE = process.env.UNIFI_CERT_FILE || '/etc/prxy-core/tls/unifi-cert.pem';
const FINGERPRINT = (process.env.UNIFI_FINGERPRINT || '').toUpperCase();
const SITE = process.env.UNIFI_SITE || 'default';
const SESSION_MAX_MS = 25 * 60 * 1000;

let creds = null; let CA = null;
try {
  const t = fs.readFileSync(CRED_FILE, 'utf8');
  const u = /^username=(\S+)$/m.exec(t); const p = /^password=(\S+)$/m.exec(t);
  if (u && p) creds = { username: u[1], password: p[1], remember: false };
  CA = fs.readFileSync(CERT_FILE);
} catch { /* not set up */ }
const configured = () => Boolean(creds && CA && FINGERPRINT);

const agent = new https.Agent({
  keepAlive: true,
  ca: CA || undefined,
  servername: SERVERNAME,
  checkServerIdentity: (host, cert) => {
    const err = tls.checkServerIdentity(SERVERNAME, cert);
    if (err) return err;
    if (cert.fingerprint256 !== FINGERPRINT) return new Error('UniFi certificate fingerprint mismatch - refusing to connect');
    return undefined;
  },
});

function raw(method, path, { body, headers } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: HOST, port: 443, method, path, agent, servername: SERVERNAME, timeout: 20000,
      headers: { Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...(headers || {}) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('UniFi API timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let session = null;
async function login() {
  if (!configured()) throw Object.assign(new Error('UniFi is not configured'), { status: 503 });
  const r = await raw('POST', '/api/auth/login', { body: creds });
  if (r.status !== 200) throw Object.assign(new Error(`UniFi sign-in failed (${r.status})`), { status: 502 });
  const cookie = (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('TOKEN='));
  if (!cookie) throw Object.assign(new Error('UniFi sign-in returned no session'), { status: 502 });
  session = { cookie, csrf: r.headers['x-csrf-token'] || null, at: Date.now() };
}

async function get(path) {
  if (!session || Date.now() - session.at > SESSION_MAX_MS) await login();
  const call = () => raw('GET', `/proxy/network${path}`, { headers: { Cookie: session.cookie, ...(session.csrf ? { 'X-CSRF-Token': session.csrf } : {}) } });
  let r = await call();
  if (r.status === 401) { await login(); r = await call(); }
  if (r.status >= 400 || !r.json || !Array.isArray(r.json.data)) throw Object.assign(new Error(`UniFi: HTTP ${r.status}`), { status: r.status === 403 ? 403 : 502 });
  return r.json.data;
}

module.exports = {
  configured,
  devices: () => get(`/api/s/${SITE}/stat/device`),
  clients: () => get(`/api/s/${SITE}/stat/sta`),
  networks: () => get(`/api/s/${SITE}/rest/networkconf`),
  health: () => get(`/api/s/${SITE}/stat/health`),
};
