// Read-only clients for the monitoring stack. All endpoints are fixed in the
// environment - user input never chooses which host we talk to.
const http = require('http');
const https = require('https');
const { GUESTS, EXTRA_LINKS } = require('./services');

const PROM = process.env.PROM_URL || 'http://10.20.40.116:9090';
const AM = process.env.ALERTMANAGER_URL || 'http://10.20.40.117:9093';
const LOKI = process.env.LOKI_URL || 'http://10.20.40.133:3100';

async function getJSON(url, timeoutMs = 8000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!res.ok) {
    const msg = (body && (body.error || body.message)) || text.slice(0, 200) || `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status === 400 ? 400 : 502 });
  }
  return body;
}

// ---------- Prometheus ----------
async function prom(query) {
  const r = await getJSON(`${PROM}/api/v1/query?query=${encodeURIComponent(query)}`);
  return r.data.result.map((x) => ({ labels: x.metric, value: Number(x.value[1]) }));
}

async function promRange(query, seconds = 86400, points = 120) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - seconds;
  const step = Math.max(15, Math.round(seconds / points));
  const r = await getJSON(`${PROM}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`, 15000);
  return r.data.result.map((x) => ({ labels: x.metric, values: x.values.map(([t, v]) => [t, Number(v)]) }));
}

// Turns [{labels:{id}, value}] into {id: value}.
const byLabel = (rows, key = 'id') => Object.fromEntries(rows.map((r) => [r.labels[key], r.value]));

async function targets() {
  const r = await getJSON(`${PROM}/api/v1/targets?state=active`);
  return r.data.activeTargets.map((t) => ({
    job: t.labels.job, instance: t.labels.instance, url: t.scrapeUrl, health: t.health,
    lastScrape: t.lastScrape, lastError: t.lastError || null, durationMs: Math.round((t.lastScrapeDuration || 0) * 1000),
  }));
}

async function ruleCount() {
  const r = await getJSON(`${PROM}/api/v1/rules`);
  return r.data.groups.reduce((n, g) => n + g.rules.length, 0);
}

// ---------- Infrastructure ----------
async function infrastructure() {
  const q = (expr) => prom(expr).catch(() => []);
  const [info, up, cpu, cpuLim, mem, memSize, disk, diskSize, uptime, onboot, notBacked,
    rx, tx, nodeInfo, version, storage, storageUse, storageSize,
    hostCpu, hostMem, hostRoot, hostLoad] = await Promise.all([
    q('pve_guest_info'), q('pve_up'), q('pve_cpu_usage_ratio'), q('pve_cpu_usage_limit'),
    q('pve_memory_usage_bytes'), q('pve_memory_size_bytes'), q('pve_disk_usage_bytes'), q('pve_disk_size_bytes'),
    q('pve_uptime_seconds'), q('pve_onboot_status'), q('pve_not_backed_up_info'),
    q('rate(pve_network_receive_bytes_total[5m])'), q('rate(pve_network_transmit_bytes_total[5m])'),
    q('pve_node_info'), q('pve_version_info'), q('pve_storage_info'),
    q('pve_disk_usage_bytes{id=~"storage/.*"}'), q('pve_disk_size_bytes{id=~"storage/.*"}'),
    q('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'),
    q('(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100'),
    q('100 - ((node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100)'),
    q('node_load1'),
  ]);
  const m = { up: byLabel(up), cpu: byLabel(cpu), cpuLim: byLabel(cpuLim), mem: byLabel(mem), memSize: byLabel(memSize),
    disk: byLabel(disk), diskSize: byLabel(diskSize), uptime: byLabel(uptime), onboot: byLabel(onboot),
    notBacked: byLabel(notBacked), rx: byLabel(rx), tx: byLabel(tx) };

  const guests = info.map(({ labels }) => {
    const id = labels.id;
    const vmid = Number(id.split('/')[1]);
    const dir = GUESTS[vmid] || {};
    const ratio = (a, b) => (b ? a / b : null);
    return {
      id, vmid, type: labels.type, name: labels.name, node: labels.node,
      ip: dir.ip || null, role: dir.role || null, runtime: dir.runtime || null, url: dir.url || null,
      running: m.up[id] === 1,
      onboot: m.onboot[id] !== 0,
      backedUp: m.notBacked[id] !== 1,
      cpus: m.cpuLim[id] ?? null,
      cpu: m.cpu[id] ?? null,
      memUsed: m.mem[id] ?? null, memSize: m.memSize[id] ?? null, memPct: ratio(m.mem[id], m.memSize[id]),
      diskUsed: m.disk[id] ?? null, diskSize: m.diskSize[id] ?? null, diskPct: ratio(m.disk[id], m.diskSize[id]),
      uptime: m.uptime[id] ?? null, rx: m.rx[id] ?? null, tx: m.tx[id] ?? null,
    };
  }).sort((a, b) => a.vmid - b.vmid);

  const node = nodeInfo[0] ? nodeInfo[0].labels : {};
  const nodeId = node.id;
  const host = {
    name: node.name || null,
    version: version[0] ? version[0].labels.version : null,
    up: nodeId ? m.up[nodeId] === 1 : null,
    uptime: nodeId ? m.uptime[nodeId] ?? null : null,
    cpuPct: hostCpu[0] ? hostCpu[0].value : null,
    memPct: hostMem[0] ? hostMem[0].value : null,
    rootPct: hostRoot[0] ? hostRoot[0].value : null,
    load1: hostLoad[0] ? hostLoad[0].value : null,
    cpus: nodeId ? m.cpuLim[nodeId] ?? null : null,
    memSize: nodeId ? m.memSize[nodeId] ?? null : null,
  };
  const used = byLabel(storageUse); const size = byLabel(storageSize);
  const pools = storage.map(({ labels }) => ({
    name: labels.storage, type: labels.plugintype, content: labels.content,
    used: used[labels.id] ?? null, size: size[labels.id] ?? null,
    pct: size[labels.id] ? used[labels.id] / size[labels.id] : null,
  }));
  return { host, pools, guests };
}

async function guestHistory(id, seconds) {
  const sel = `{id="${id.replace(/[^a-z0-9/]/gi, '')}"}`;
  const [cpu, mem, rx, tx] = await Promise.all([
    promRange(`pve_cpu_usage_ratio${sel} * 100`, seconds),
    promRange(`pve_memory_usage_bytes${sel}`, seconds),
    promRange(`rate(pve_network_receive_bytes_total${sel}[5m])`, seconds),
    promRange(`rate(pve_network_transmit_bytes_total${sel}[5m])`, seconds),
  ]);
  const first = (s) => (s[0] ? s[0].values : []);
  return { cpu: first(cpu), mem: first(mem), rx: first(rx), tx: first(tx) };
}

// ---------- Docker (via cadvisor on LXC 110) ----------
async function containers() {
  const q = (expr) => prom(expr).catch(() => []);
  const [seen, everSeen, cpu, mem, rx, tx, fs, started, image] = await Promise.all([
    q('time() - container_last_seen{name!=""}'),
    q('time() - max by (name) (max_over_time(container_last_seen{name!=""}[24h]))'),
    q('sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[5m])) * 100'),
    q('sum by (name) (container_memory_working_set_bytes{name!=""})'),
    q('sum by (name) (rate(container_network_receive_bytes_total{name!=""}[5m]))'),
    q('sum by (name) (rate(container_network_transmit_bytes_total{name!=""}[5m]))'),
    q('max by (name) (container_fs_usage_bytes{name!=""})'),
    q('max by (name) (container_start_time_seconds{name!=""})'),
    q('count by (name, image) (container_last_seen{name!="", image!=""})'),
  ]);
  const by = (rows) => byLabel(rows, 'name');
  const s = by(seen); const cp = by(cpu); const me = by(mem); const r = by(rx); const t = by(tx); const f = by(fs); const st = by(started);
  const images = Object.fromEntries(image.map((x) => [x.labels.name, x.labels.image]));
  // Anything cadvisor saw in the last 24h but not in the last 2 minutes has stopped.
  return everSeen.map(({ labels, value }) => {
    const name = labels.name;
    const lastSeenAgo = s[name] ?? value;
    return {
      name, image: images[name] || null,
      running: lastSeenAgo < 120,
      lastSeenAgo,
      cpuPct: cp[name] ?? null, mem: me[name] ?? null, rx: r[name] ?? null, tx: t[name] ?? null, disk: f[name] ?? null,
      startedAt: st[name] ? st[name] * 1000 : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function containerHistory(seconds) {
  const [cpu, mem] = await Promise.all([
    promRange('topk(6, sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[5m])) * 100)', seconds),
    promRange('topk(6, sum by (name) (container_memory_working_set_bytes{name!=""}))', seconds),
  ]);
  const shape = (s) => s.map((x) => ({ name: x.labels.name, values: x.values }));
  return { cpu: shape(cpu), mem: shape(mem) };
}

// ---------- Alertmanager ----------
async function alerts() {
  const [list, silences, status] = await Promise.all([
    getJSON(`${AM}/api/v2/alerts`),
    getJSON(`${AM}/api/v2/silences`),
    getJSON(`${AM}/api/v2/status`).catch(() => null),
  ]);
  return {
    alerts: list.map((a) => ({ name: a.labels.alertname, severity: a.labels.severity || null, state: a.status.state,
      startsAt: a.startsAt, summary: (a.annotations && (a.annotations.summary || a.annotations.description)) || '', labels: a.labels })),
    silences: silences.filter((s) => s.status.state === 'active').map((s) => ({ id: s.id, comment: s.comment,
      createdBy: s.createdBy, endsAt: s.endsAt, matchers: s.matchers.map((x) => `${x.name}${x.isEqual === false ? '!' : ''}${x.isRegex ? '=~' : '='}${x.value}`) })),
    receivers: status && status.config ? (status.config.original.match(/^\s*- name:\s*(\S+)/gm) || []).map((x) => x.split(':')[1].trim().replace(/['"]/g, '')) : [],
  };
}

// ---------- Loki ----------
async function lokiLabels() {
  const start = (Date.now() - 7 * 86400 * 1000) * 1e6;
  const r = await getJSON(`${LOKI}/loki/api/v1/labels?start=${start}`);
  const out = {};
  await Promise.all(r.data.filter((l) => l !== '__name__').map(async (l) => {
    const v = await getJSON(`${LOKI}/loki/api/v1/label/${encodeURIComponent(l)}/values?start=${start}`);
    // Only offer low-cardinality labels in the picker (geoip_* etc. have hundreds of values).
    if (v.data.length <= 30) out[l] = v.data;
  }));
  return out;
}

// Instant LogQL metric query -> [{labels, value}]
async function lokiVector(expr, timeoutMs = 30000) {
  const r = await getJSON(`${LOKI}/loki/api/v1/query?query=${encodeURIComponent(expr)}&time=${Math.floor(Date.now() / 1000)}`, timeoutMs);
  return r.data.result.map((x) => ({ labels: x.metric, value: Number(x.value[1]) }));
}

// LogQL metric range query -> [{labels, values:[[sec, n]]}]
async function lokiRange(expr, seconds = 86400, points = 120, timeoutMs = 30000) {
  const end = Math.floor(Date.now() / 1000);
  const step = Math.max(30, Math.round(seconds / points));
  const r = await getJSON(`${LOKI}/loki/api/v1/query_range?query=${encodeURIComponent(expr)}&start=${end - seconds}&end=${end}&step=${step}`, timeoutMs);
  return r.data.result.map((x) => ({ labels: x.metric, values: x.values.map(([t, v]) => [t, Number(v)]) }));
}

const logqlString = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

// Builds LogQL from validated parts, or passes through a raw query (Loki is read-only).
function buildLogQL({ labels = {}, contains, raw }) {
  if (raw) return String(raw);
  const sel = Object.entries(labels).filter(([k, v]) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) && v)
    .map(([k, v]) => `${k}=${logqlString(v)}`);
  if (!sel.length) throw Object.assign(new Error('Pick at least one label (for example job)'), { status: 400 });
  return `{${sel.join(', ')}}` + (contains ? ` |= ${logqlString(contains)}` : '');
}

async function logs({ query, seconds = 3600, limit = 200 }) {
  const end = Date.now() * 1e6;
  const start = end - Math.min(seconds, 7 * 86400) * 1e9;
  limit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
  const url = `${LOKI}/loki/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&limit=${limit}&direction=backward`;
  const r = await getJSON(url, 20000);
  if (r.data.resultType !== 'streams') throw Object.assign(new Error('Use a log query (metric queries belong on dashboards)'), { status: 400 });
  const lines = [];
  for (const s of r.data.result) for (const [ts, line] of s.values) lines.push({ ts: Number(ts.slice(0, 13)), line, labels: s.stream });
  lines.sort((a, b) => b.ts - a.ts);
  return { lines: lines.slice(0, limit), query };
}

async function lokiFreshness() {
  // Lines per job over the last hour vs. the last 7 days - catches pipelines that went quiet.
  const now = Math.floor(Date.now() / 1000);
  const run = (expr) => getJSON(`${LOKI}/loki/api/v1/query?query=${encodeURIComponent(expr)}&time=${now}`, 20000)
    .then((r) => Object.fromEntries(r.data.result.map((x) => [x.metric.job, Number(x.value[1])]))).catch(() => ({}));
  const [hour, week] = await Promise.all([run('sum by (job) (count_over_time({job=~".+"}[1h]))'), run('sum by (job) (count_over_time({job=~".+"}[7d]))')]);
  return Object.keys(week).sort().map((job) => ({ job, lastHour: hour[job] || 0, lastWeek: week[job] }));
}

// ---------- HTTP probes of service web UIs ----------
function probe(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const lib = url.startsWith('https') ? https : http;
    // Several LAN UIs (Proxmox, code-server, Prxy Core) use self-signed certs. The probe only
    // checks reachability - no credentials are sent and the body is discarded - so skipping
    // verification here exposes nothing.
    const req = lib.get(url, { rejectUnauthorized: false, timeout: timeoutMs, headers: { 'User-Agent': 'prxy-core-probe' } }, (res) => {
      res.resume();
      // Any HTTP answer below 500 means the service is up (401/302 = login wall).
      resolve({ ok: res.statusCode < 500, status: res.statusCode, ms: Date.now() - started });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ ok: false, status: null, ms: Date.now() - started, error: e.message }));
  });
}

let probeCache = { at: 0, data: null };
async function probeAll() {
  if (Date.now() - probeCache.at < 60000 && probeCache.data) return probeCache.data;
  const list = [
    ...Object.entries(GUESTS).filter(([, g]) => g.url).map(([vmid, g]) => ({ name: g.role, vmid: Number(vmid), url: g.url })),
    ...EXTRA_LINKS.map((l) => ({ name: l.name, vmid: null, url: l.url })),
  ];
  const results = await Promise.all(list.map(async (s) => ({ ...s, ...(await probe(s.url)) })));
  probeCache = { at: Date.now(), data: results };
  return results;
}

// ---------- Power (Aferiy UPS via exporter on LXC 132) ----------
async function power(seconds = 86400) {
  const q = (expr) => prom(expr).then((r) => (r[0] ? r[0].value : null)).catch(() => null);
  const [battery, outW, inW, runtime, lastSeen] = await Promise.all([
    q('aferiy_battery_percent'), q('aferiy_output_watts'), q('aferiy_input_watts'), q('aferiy_runtime_seconds'),
    q('time() - aferiy_last_seen_unixtime')]);
  const [batteryHist, loadHist, inputHist] = await Promise.all([
    promRange('aferiy_battery_percent', seconds), promRange('aferiy_output_watts', seconds), promRange('aferiy_input_watts', seconds)]);
  const first = (s) => (s[0] ? s[0].values : []);
  const stale = lastSeen == null || lastSeen > 600;
  return {
    battery, outputW: outW, inputW: inW, runtimeS: runtime, lastSeenAgo: lastSeen, stale,
    // Charging input near zero while load continues means mains power is gone.
    onBattery: !stale && inW != null && outW != null && inW < 5 && outW > 5,
    history: { battery: first(batteryHist), load: first(loadHist), input: first(inputHist) },
  };
}

module.exports = {
  lokiVector, lokiRange,
  power,
  prom, promRange, targets, ruleCount, infrastructure, guestHistory, containers, containerHistory,
  alerts, lokiLabels, buildLogQL, logs, lokiFreshness, probeAll,
};
