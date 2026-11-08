// Read-only client for the OPNsense API (user `prxycore`, API key only). Only a fixed set of
// read calls is exported (no generic request function, no add/set/del/apply endpoints), so Prxy Core
// cannot change the firewall even if the account were given more rights. The one POST is
// searchRule, which OPNsense defines as a search (read) call.
// TLS: the firewall's own certificate is the trust anchor (OPNSENSE_CERT_FILE), the name it was
// issued for (OPNsense.internal) is checked, and its SHA-256 fingerprint is pinned on top.
const fs = require('fs');
const https = require('https');
const tls = require('tls');

const HOST = process.env.OPNSENSE_HOST || '10.20.40.1';
const SERVERNAME = process.env.OPNSENSE_SERVERNAME || 'OPNsense.internal';
const KEY_FILE = process.env.OPNSENSE_KEY_FILE || '/etc/prxy-core/opnsense.key';
const CERT_FILE = process.env.OPNSENSE_CERT_FILE || '/etc/prxy-core/tls/opnsense-cert.pem';
const FINGERPRINT = (process.env.OPNSENSE_FINGERPRINT || '').toUpperCase();

let creds = null; let CA = null;
try {
  const t = fs.readFileSync(KEY_FILE, 'utf8');
  const k = /^key=(\S+)$/m.exec(t); const s = /^secret=(\S+)$/m.exec(t);
  if (k && s) creds = `${k[1]}:${s[1]}`;
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
    if (cert.fingerprint256 !== FINGERPRINT) return new Error('OPNsense certificate fingerprint mismatch - refusing to connect');
    return undefined;
  },
});

function call(method, path, body, timeoutMs = 20000) {
  if (!configured()) return Promise.reject(Object.assign(new Error('OPNsense API is not configured'), { status: 503 }));
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: HOST, port: 443, method, path, agent, servername: SERVERNAME, timeout: timeoutMs,
      headers: {
        Authorization: `Basic ${Buffer.from(creds).toString('base64')}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* not JSON */ }
        if (res.statusCode >= 400) return reject(Object.assign(new Error(`OPNsense: ${(json && (json.message || json.errorMessage)) || 'HTTP ' + res.statusCode}`), { status: res.statusCode === 403 ? 403 : 502 }));
        resolve(json);
      });
    });
    req.on('timeout', () => req.destroy(new Error('OPNsense API timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
const get = (path) => call('GET', path);

module.exports = {
  configured,
  interfaces: () => get('/api/interfaces/overview/interfacesInfo').then((r) => r.rows),
  traffic: () => get('/api/diagnostics/traffic/interface').then((r) => r.interfaces),
  gateways: () => get('/api/routes/gateway/status').then((r) => r.items),
  rules: () => call('POST', '/api/firewall/filter/searchRule', { rowCount: -1 }).then((r) => r.rows),
  firewallLog: () => get('/api/diagnostics/firewall/log'),
};
