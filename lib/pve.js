// Proxmox API client using the scoped `prxycore@pve!core` token (role PrxyCoreOps:
// audit + power + backup only). TLS is fully verified against the cluster's own CA
// (/etc/pve/pve-root-ca.pem, copied to PVE_CA_FILE) using the node hostname from the
// certificate, and the leaf certificate's SHA-256 fingerprint is pinned on top.
const fs = require('fs');
const https = require('https');
const tls = require('tls');

const HOST = process.env.PVE_HOST || '10.20.40.224';
const PORT = Number(process.env.PVE_PORT || 8006);
const SERVERNAME = process.env.PVE_SERVERNAME || 'pve-node';
const CA_FILE = process.env.PVE_CA_FILE || '/etc/prxy-core/tls/pve-root-ca.pem';
const TOKEN_ID = process.env.PVE_TOKEN_ID;
const TOKEN_SECRET = process.env.PVE_TOKEN_SECRET;
const FINGERPRINT = (process.env.PVE_FINGERPRINT || '').toUpperCase();

const CA = fs.existsSync(CA_FILE) ? fs.readFileSync(CA_FILE) : null;
const configured = () => Boolean(TOKEN_ID && TOKEN_SECRET && FINGERPRINT && CA);

const agent = new https.Agent({
  keepAlive: true,
  ca: CA || undefined,
  servername: SERVERNAME,
  checkServerIdentity: (host, cert) => {
    const err = tls.checkServerIdentity(SERVERNAME, cert);
    if (err) return err;
    if (cert.fingerprint256 !== FINGERPRINT) return new Error('Proxmox certificate fingerprint mismatch - refusing to connect');
    return undefined;
  },
});

function request(method, path, params) {
  if (!configured()) return Promise.reject(Object.assign(new Error('Proxmox token not configured'), { status: 503 }));
  const body = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : null;
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: HOST, port: PORT, servername: SERVERNAME, method, path: `/api2/json${path}`, agent, timeout: 15000,
      headers: {
        Authorization: `PVEAPIToken=${TOKEN_ID}=${TOKEN_SECRET}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* not JSON */ }
        if (res.statusCode >= 400) {
          const msg = (json && json.errors && JSON.stringify(json.errors)) || res.statusMessage || `HTTP ${res.statusCode}`;
          return reject(Object.assign(new Error(`Proxmox: ${msg}`), { status: res.statusCode === 403 ? 403 : 502 }));
        }
        resolve(json ? json.data : null);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Proxmox API timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const get = (path) => request('GET', path);
const post = (path, params) => request('POST', path, params);

let nodeName = null;
async function node() {
  if (!nodeName) nodeName = (await get('/nodes'))[0].node;
  return nodeName;
}

async function guestKind(vmid) {
  const list = await get('/cluster/resources?type=vm');
  const g = list.find((x) => x.vmid === Number(vmid));
  if (!g) throw Object.assign(new Error('Unknown guest'), { status: 404 });
  return { type: g.type, node: g.node, name: g.name, status: g.status };
}

// start | shutdown | reboot. Returns the Proxmox task id (UPID).
async function power(vmid, op) {
  if (!['start', 'shutdown', 'reboot'].includes(op)) throw Object.assign(new Error('Unsupported operation'), { status: 400 });
  const g = await guestKind(vmid);
  return post(`/nodes/${g.node}/${g.type}/${Number(vmid)}/status/${op}`, op === 'shutdown' ? { timeout: 120 } : null);
}

async function backupNow(vmid, storage = 'backups') {
  const n = await node();
  return post(`/nodes/${n}/vzdump`, { vmid: Number(vmid), storage, mode: 'snapshot', compress: 'zstd', 'notes-template': '{{guestname}}' });
}

async function taskStatus(upid) {
  if (!/^UPID:[\w.:@!-]+$/.test(upid)) throw Object.assign(new Error('Bad task id'), { status: 400 });
  const n = upid.split(':')[1];
  return get(`/nodes/${n}/tasks/${encodeURIComponent(upid)}/status`);
}

async function backups() {
  const n = await node();
  const [jobs, storages, tasks, notCovered] = await Promise.all([
    get('/cluster/backup'),
    get(`/nodes/${n}/storage?content=backup`),
    get(`/nodes/${n}/tasks?typefilter=vzdump&limit=60&source=all`),
    get('/cluster/backup-info/not-backed-up').catch(() => []),
  ]);
  const files = (await Promise.all(storages.map((s) => get(`/nodes/${n}/storage/${s.storage}/content?content=backup`)
    .then((items) => items.map((i) => ({ ...i, storage: s.storage }))).catch(() => [])))).flat();
  return {
    node: n,
    jobs: jobs.map((j) => ({ id: j.id, schedule: j.schedule, storage: j.storage, enabled: j.enabled !== 0, all: !!j.all,
      exclude: j.exclude || '', vmid: j.vmid || '', mode: j.mode, prune: j['prune-backups'] || null, comment: j.comment || '', nextRun: j['next-run'] || null })),
    storages: storages.map((s) => ({ name: s.storage, type: s.type, used: s.used, total: s.total, avail: s.avail, active: !!s.active })),
    files: files.map((f) => ({ volid: f.volid, vmid: f.vmid, ctime: f.ctime, size: f.size, storage: f.storage, notes: f.notes || '',
      protected: !!f.protected, verified: f.verification ? f.verification.state : null })),
    tasks: tasks.map((t) => ({ upid: t.upid, vmid: t.id || null, start: t.starttime, end: t.endtime || null, status: t.status || 'running', user: t.user })),
    notCovered: notCovered.map((x) => ({ vmid: x.vmid, name: x.name, type: x.type })),
  };
}

module.exports = { configured, power, backupNow, taskStatus, backups, guestKind };
