// Numbers-first dashboards that replace the four Grafana boards. Every query is fixed
// here (the browser only chooses a dashboard name, a time range and, for the device
// view, a validated IPv4 address). Panels come back as plain data for the SPA to draw:
//   stats  {items:[{label,value,fmt,note}]}      - big numbers
//   rank   {title,rows:[{label,sub,value}],fmt}  - ranked list with bars
//   table  {title,columns:[{key,label,fmt}],rows}
//   chart  {title,series:[{name,values}],fmt}
//   logs   {title,lines:[{ts,line}]}
const obs = require('./observe');
const { GUESTS } = require('./services');

const nameByIp = Object.fromEntries(Object.values(GUESTS).filter((g) => g.ip).map((g) => [g.ip, g.name]));
const cache = new Map();
const TTL = 30000;

// A failing query becomes an empty panel with a note instead of failing the page.
const safe = (p, fallback) => p.catch((e) => { fallback = fallback || []; fallback.error = e.message; return fallback; });
const val = (rows) => (rows && rows[0] ? rows[0].value : null);
const toRank = (rows, key, subKey) => rows
  .filter((r) => Number.isFinite(r.value))
  .map((r) => ({ label: r.labels[key] || '(none)', sub: subKey ? r.labels[subKey] || null : (nameByIp[r.labels[key]] || null), value: r.value }))
  .sort((a, b) => b.value - a.value);

const NF = '{job="netflow"} | json | unwrap bytes';
const lokiSum = (by, sel, secs, extra = '') => `topk(12, sum by(${by}) (sum_over_time(${sel}${extra} [${secs}s])))`;
const lastLogs = (query, secs, limit = 40) => safe(obs.logs({ query, seconds: secs, limit }).then((r) => r.lines.map((l) => ({ ts: l.ts, line: l.line }))), []);

async function traffic(fullSecs) {
  // NetFlow is huge: beyond 24 h the Loki sums time out, so those panels are capped.
  const secs = Math.min(fullSecs, 86400);
  const s = `${secs}s`;
  const P = (e) => safe(obs.prom(e), []);
  const L = (e) => safe(obs.lokiVector(e), []);
  const R = (e, n = 80) => safe(obs.lokiRange(e, secs, n), []);
  const [cpu, mem, disk, blocked, allowed, bytes, flows, suri, unifi,
    srcs, dsts, ports, protos, countries,
    bw, flowRate, suriRate, unifiRate, suriLogs, unifiLogs] = await Promise.all([
    P('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'),
    P('(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100'),
    P('100 - ((node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100)'),
    P('nextdns_blocked_queries'), P('nextdns_allowed_queries'),
    L(`sum(sum_over_time(${NF} [${s}]))`),
    L(`sum(count_over_time({job="netflow"} [${s}]))`),
    L(`sum(count_over_time({job="suricata"} [${fullSecs}s]))`),
    L(`sum(count_over_time({job="unifi_siem"} [${fullSecs}s]))`),
    L(lokiSum('src_addr', NF, secs)), L(lokiSum('dst_addr', NF, secs)), L(lokiSum('dst_port', NF, secs)),
    L(lokiSum('proto', NF, secs)),
    L(`topk(12, sum by(geoip_country_name) (sum_over_time(${NF} | geoip_country_name != "" [${s}])))`),
    R(`sum(sum_over_time(${NF} [$__interval]))`.replace('$__interval', `${Math.max(30, Math.round(secs / 80))}s`)),
    R(`sum(count_over_time({job="netflow"} [${Math.max(30, Math.round(secs / 80))}s]))`),
    R(`sum(count_over_time({job="suricata"} [${Math.max(30, Math.round(secs / 80))}s]))`),
    R(`sum(count_over_time({job="unifi_siem"} [${Math.max(30, Math.round(secs / 80))}s]))`),
    lastLogs('{job="suricata"}', fullSecs, 25), lastLogs('{job="unifi_siem"}', fullSecs, 25),
  ]);
  const step = Math.max(30, Math.round(secs / 80));
  const perSec = (series) => series.map((x) => ({ name: 'Bandwidth', values: x.values.map(([t, v]) => [t, v / step]) }));
  const blockedN = val(blocked); const allowedN = val(allowed);
  const out = {
    title: 'Network traffic', panels: [
      { kind: 'stats', items: [
        { label: 'Traffic', value: val(bytes), fmt: 'bytes', note: `NetFlow, last ${rangeName(secs)}` },
        { label: 'Flows', value: val(flows), fmt: 'num', note: 'connections recorded' },
        { label: 'Suricata events', value: val(suri), fmt: 'num', note: 'IDS log lines' },
        { label: 'UniFi events', value: val(unifi), fmt: 'num', note: 'switch / AP / client' },
        { label: 'DNS blocked', value: blockedN, fmt: 'num', note: 'NextDNS, all-time counter' },
        { label: 'DNS block rate', value: blockedN != null && allowedN != null ? (blockedN / (blockedN + allowedN)) * 100 : null, fmt: 'pct', note: `${(allowedN ?? 0).toLocaleString()} allowed` },
        { label: 'Host CPU', value: val(cpu), fmt: 'pct', note: 'Proxmox host' },
        { label: 'Host memory', value: val(mem), fmt: 'pct', note: 'Proxmox host' },
        { label: 'Host disk /', value: val(disk), fmt: 'pct', note: 'Proxmox root' },
      ] },
      { kind: 'chart', title: 'Bandwidth', fmt: 'rate', series: perSec(bw) },
      { kind: 'chart', title: 'Flows over time', fmt: 'num', series: flowRate.map((x) => ({ name: 'Flows', values: x.values })) },
      { kind: 'rank', title: 'Top sources', fmt: 'bytes', rows: toRank(srcs, 'src_addr') },
      { kind: 'rank', title: 'Top destinations', fmt: 'bytes', rows: toRank(dsts, 'dst_addr') },
      { kind: 'rank', title: 'Top destination ports', fmt: 'bytes', rows: toRank(ports, 'dst_port').map((r) => ({ ...r, sub: PORT_NAMES[r.label] || null })) },
      { kind: 'rank', title: 'Protocols', fmt: 'bytes', rows: toRank(protos, 'proto') },
      { kind: 'rank', title: 'Destination countries', fmt: 'bytes', rows: toRank(countries, 'geoip_country_name') },
      { kind: 'chart', title: 'Suricata events', fmt: 'num', series: suriRate.map((x) => ({ name: 'Events', values: x.values })) },
      { kind: 'chart', title: 'UniFi events', fmt: 'num', series: unifiRate.map((x) => ({ name: 'Events', values: x.values })) },
      { kind: 'logs', title: 'Suricata - latest', lines: suriLogs },
      { kind: 'logs', title: 'UniFi - latest', lines: unifiLogs },
    ],
  };
  const errs = [flows, bytes, srcs].map((x) => x.error).filter(Boolean);
  if (errs.length) out.notice = `Some log queries failed (${errs[0]}). Try a shorter range.`;
  else if (fullSecs > secs) out.notice = 'Traffic panels (NetFlow) are limited to the last 24 hours; event counts and logs use the full range.';
  return out;
}

// One device's traffic (drill-down by source IP).
async function device(ip, fullSecs) {
  const secs = Math.min(fullSecs, 86400);
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw Object.assign(new Error('Enter an IPv4 address'), { status: 400 });
  const s = `${secs}s`; const step = Math.max(30, Math.round(secs / 80));
  const sel = `${NF} | src_addr="${ip}"`;
  const [total, dests, bw, log] = await Promise.all([
    safe(obs.lokiVector(`sum(sum_over_time(${sel} [${s}]))`), []),
    safe(obs.lokiVector(`topk(20, sum by(dst_addr, geoip_country_name) (sum_over_time(${sel} [${s}])))`), []),
    safe(obs.lokiRange(`sum(sum_over_time(${sel} [${step}s]))`, secs, 80), []),
    lastLogs(`{job="netflow"} | json | src_addr="${ip}"`, secs, 40),
  ]);
  return { title: `Device ${ip}`, name: nameByIp[ip] || null, panels: [
    { kind: 'stats', items: [{ label: 'Uploaded (last ' + rangeName(secs) + ')', value: val(total), fmt: 'bytes', note: nameByIp[ip] || 'bytes sent by this address' }] },
    { kind: 'chart', title: 'Bandwidth', fmt: 'rate', series: bw.map((x) => ({ name: 'Bandwidth', values: x.values.map(([t, v]) => [t, v / step]) })) },
    { kind: 'table', title: 'Top destinations', columns: [{ key: 'dst', label: 'Destination' }, { key: 'country', label: 'Country' }, { key: 'bytes', label: 'Bytes', fmt: 'bytes' }],
      rows: dests.map((r) => ({ dst: r.labels.dst_addr, country: r.labels.geoip_country_name || '', bytes: r.value })).sort((a, b) => b.bytes - a.bytes) },
    { kind: 'logs', title: 'Live flows', lines: log },
  ] };
}

async function wifi(secs) {
  const s = `${secs}s`; const U = '{job="unifi_siem"}';
  const L = (e) => safe(obs.lokiVector(e), []);
  const cnt = (name) => `sum(count_over_time(${U} | event_name="${name}" [${s}]))`;
  const by = (label) => L(`topk(12, sum by(${label}) (count_over_time(${U} | ${label} != "" [${s}])))`);
  const step = Math.max(30, Math.round(secs / 80));
  const evName = (n) => safe(obs.lokiRange(`sum(count_over_time(${U} | event_name="${n}" [${step}s]))`, secs, 80), []);
  const [conn, disc, roam, roamers, discers, aps, bands, ssids, nets, widths, auths, chans, weak, devs,
    cSeries, dSeries, rSeries, rssi, roamLog, otherLog, wifiLog] = await Promise.all([
    L(cnt('WiFi Client Connected')), L(cnt('WiFi Client Disconnected')), L(cnt('WiFi Client Roamed')),
    L(`topk(10, sum by(client_alias) (count_over_time(${U} | event_name="WiFi Client Roamed" | client_alias != "" [${s}])))`),
    L(`topk(10, sum by(client_alias) (count_over_time(${U} | event_name="WiFi Client Disconnected" | client_alias != "" [${s}])))`),
    by('ap_name'), by('wifi_band'), by('ssid'), by('network_name'), by('wifi_channel_width'), by('auth_method'), by('wifi_channel'),
    L(`topk(20, max by(client_alias, ap_name) (max_over_time(${U} | rssi != "" | unwrap rssi [1h]))) < -70`),
    L(`max by(client_alias, client_mac, ssid, ap_name) (max_over_time(${U} | ssid != "" | client_mac != "" | unwrap rssi [${s}]))`),
    evName('WiFi Client Connected'), evName('WiFi Client Disconnected'), evName('WiFi Client Roamed'),
    safe(obs.lokiRange(`avg by(ap_name) (avg_over_time(${U} | rssi != "" | unwrap rssi [${step}s]))`, secs, 80), []),
    lastLogs(`${U} | event_name="WiFi Client Roamed" | line_format "{{.client_alias}}: {{.last_ap_name}} ({{.last_rssi}} dBm) -> {{.ap_name}} ({{.rssi}} dBm)"`, secs, 40),
    lastLogs(`${U} | event_name !~ "WiFi.*"`, secs, 40),
    lastLogs(`${U} | event_name =~ "WiFi.*"`, secs, 40),
  ]);
  const net = (rows, key) => toRank(rows, key, null).map((r) => ({ ...r, sub: null }));
  return { title: 'Wi-Fi and clients', panels: [
    { kind: 'stats', items: [
      { label: 'Connects', value: val(conn), fmt: 'num', note: `last ${rangeName(secs)}` },
      { label: 'Disconnects', value: val(disc), fmt: 'num', note: 'a high number = flaky clients' },
      { label: 'Roams', value: val(roam), fmt: 'num', note: 'moves between access points' },
      { label: 'Weak signal now', value: weak.length, fmt: 'num', note: 'clients below -70 dBm (1 h)' },
      { label: 'Wi-Fi devices seen', value: devs.length, fmt: 'num', note: `in the last ${rangeName(secs)}` },
    ] },
    { kind: 'chart', title: 'Connection events', fmt: 'num', series: [
      { name: 'Connected', values: cSeries[0] ? cSeries[0].values : [] }, { name: 'Disconnected', values: dSeries[0] ? dSeries[0].values : [] }, { name: 'Roamed', values: rSeries[0] ? rSeries[0].values : [] }] },
    { kind: 'chart', title: 'Signal strength (dBm, closer to 0 is stronger)', fmt: 'dbm', min0: false, series: rssi.map((x) => ({ name: x.labels.ap_name || 'AP', values: x.values })) },
    { kind: 'rank', title: 'Most frequent roamers', fmt: 'num', rows: net(roamers, 'client_alias') },
    { kind: 'rank', title: 'Most frequent disconnects', fmt: 'num', rows: net(discers, 'client_alias') },
    { kind: 'rank', title: 'Events by access point', fmt: 'num', rows: net(aps, 'ap_name') },
    { kind: 'rank', title: 'Events by band', fmt: 'num', rows: net(bands, 'wifi_band') },
    { kind: 'rank', title: 'Events by SSID', fmt: 'num', rows: net(ssids, 'ssid') },
    { kind: 'rank', title: 'Events by network / VLAN', fmt: 'num', rows: net(nets, 'network_name') },
    { kind: 'rank', title: 'Channel width (MHz)', fmt: 'num', rows: net(widths, 'wifi_channel_width') },
    { kind: 'rank', title: 'Auth method', fmt: 'num', rows: net(auths, 'auth_method') },
    { kind: 'rank', title: 'Channel usage (congestion check)', fmt: 'num', rows: net(chans, 'wifi_channel') },
    { kind: 'table', title: 'Weak signal right now (below -70 dBm, last hour)', columns: [{ key: 'client', label: 'Device' }, { key: 'ap', label: 'Access point' }, { key: 'rssi', label: 'Signal', fmt: 'dbm' }],
      rows: weak.map((r) => ({ client: r.labels.client_alias || r.labels.client_mac || '?', ap: r.labels.ap_name || '', rssi: r.value })).sort((a, b) => a.rssi - b.rssi) },
    { kind: 'table', title: 'Devices by SSID', columns: [{ key: 'client', label: 'Device' }, { key: 'mac', label: 'MAC' }, { key: 'ssid', label: 'SSID' }, { key: 'ap', label: 'Access point' }, { key: 'rssi', label: 'Signal', fmt: 'dbm' }],
      rows: devs.map((r) => ({ client: r.labels.client_alias || '', mac: r.labels.client_mac, ssid: r.labels.ssid, ap: r.labels.ap_name || '', rssi: r.value })).sort((a, b) => a.client.localeCompare(b.client)) },
    { kind: 'logs', title: 'Roam transitions (device, from AP, to AP, signal)', lines: roamLog },
    { kind: 'logs', title: 'Wi-Fi events', lines: wifiLog },
    { kind: 'logs', title: 'Critical / security / device events (non-Wi-Fi)', lines: otherLog },
  ] };
}

async function docker(secs) {
  const [list, hist, rx, tx] = await Promise.all([
    safe(obs.containers(), []), safe(obs.containerHistory(secs), { cpu: [], mem: [] }),
    safe(obs.prom('topk(14, sum by(name) (rate(container_network_receive_bytes_total{name!=""}[5m])))'), []),
    safe(obs.prom('topk(14, sum by(name) (rate(container_network_transmit_bytes_total{name!=""}[5m])))'), [])]);
  const run = list.filter((c) => c.running);
  const sum = (k) => run.reduce((n, c) => n + (c[k] || 0), 0);
  return { title: 'Docker health', panels: [
    { kind: 'stats', items: [
      { label: 'Running', value: run.length, fmt: 'num', note: `of ${list.length} seen in 24 h` },
      { label: 'Stopped', value: list.length - run.length, fmt: 'num', note: list.filter((c) => !c.running).map((c) => c.name).join(', ') || 'none' },
      { label: 'CPU (total)', value: sum('cpuPct'), fmt: 'pct', note: 'sum across containers' },
      { label: 'Memory (total)', value: sum('mem'), fmt: 'bytes', note: 'working set' },
      { label: 'Network in', value: sum('rx'), fmt: 'rate', note: 'all containers' },
      { label: 'Network out', value: sum('tx'), fmt: 'rate', note: 'all containers' },
    ] },
    { kind: 'table', title: 'Every container', columns: [
      { key: 'name', label: 'Container' }, { key: 'state', label: 'State' }, { key: 'cpu', label: 'CPU', fmt: 'pct' }, { key: 'mem', label: 'Memory', fmt: 'bytes' },
      { key: 'rx', label: 'Net in', fmt: 'rate' }, { key: 'tx', label: 'Net out', fmt: 'rate' }, { key: 'disk', label: 'Disk', fmt: 'bytes' }, { key: 'image', label: 'Image' }],
      rows: list.map((c) => ({ name: c.name, state: c.running ? 'running' : 'stopped', cpu: c.cpuPct, mem: c.mem, rx: c.rx, tx: c.tx, disk: c.disk, image: c.image || '' })).sort((a, b) => (b.mem || 0) - (a.mem || 0)) },
    { kind: 'chart', title: 'CPU % (top 6)', fmt: 'pct', series: hist.cpu },
    { kind: 'chart', title: 'Memory (top 6)', fmt: 'bytes', series: hist.mem },
    { kind: 'rank', title: 'Network in by container', fmt: 'rate', rows: toRank(rx, 'name') },
    { kind: 'rank', title: 'Network out by container', fmt: 'rate', rows: toRank(tx, 'name') },
  ] };
}

async function capacity(secs) {
  const [inf, cpuH, memH] = await Promise.all([obs.infrastructure(),
    safe(obs.promRange('topk(8, pve_cpu_usage_ratio * on(id) group_left(name) pve_guest_info) * 100', secs), []),
    safe(obs.promRange('topk(8, pve_memory_usage_bytes * on(id) group_left(name) pve_guest_info)', secs), [])]);
  const g = inf.guests; const up = g.filter((x) => x.running);
  const h = inf.host;
  return { title: 'Infrastructure capacity', panels: [
    { kind: 'stats', items: [
      { label: 'Guests tracked', value: g.length, fmt: 'num', note: `${up.length} running` },
      { label: 'Host CPU', value: h.cpuPct, fmt: 'pct', note: h.cpus ? `${h.cpus} cores, load ${h.load1 != null ? h.load1.toFixed(2) : '-'}` : '' },
      { label: 'Host memory', value: h.memPct, fmt: 'pct', note: h.memSize ? `${(h.memSize / 2 ** 30).toFixed(0)} GiB installed` : '' },
      { label: 'Host disk /', value: h.rootPct, fmt: 'pct', note: 'Proxmox root' },
      { label: 'Guest memory used', value: up.reduce((n, x) => n + (x.memUsed || 0), 0), fmt: 'bytes', note: 'sum of running guests' },
      { label: 'Guest CPU', value: up.reduce((n, x) => n + (x.cpu || 0) * (x.cpus || 1), 0) * 100, fmt: 'pct', note: 'core-equivalents x 100' },
    ] },
    { kind: 'table', title: 'Storage pools', columns: [{ key: 'name', label: 'Pool' }, { key: 'type', label: 'Type' }, { key: 'used', label: 'Used', fmt: 'bytes' }, { key: 'size', label: 'Size', fmt: 'bytes' }, { key: 'pct', label: 'Full', fmt: 'frac' }],
      rows: inf.pools.map((p) => ({ name: p.name, type: p.type, used: p.used, size: p.size, pct: p.pct })) },
    { kind: 'table', title: 'Every guest', columns: [
      { key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'state', label: 'State' }, { key: 'cpu', label: 'CPU', fmt: 'frac' }, { key: 'mem', label: 'Memory', fmt: 'bytes' }, { key: 'memPct', label: 'Mem %', fmt: 'frac' },
      { key: 'disk', label: 'Disk', fmt: 'bytes' }, { key: 'diskPct', label: 'Disk %', fmt: 'frac' }, { key: 'rx', label: 'Net in', fmt: 'rate' }, { key: 'tx', label: 'Net out', fmt: 'rate' }, { key: 'uptime', label: 'Uptime', fmt: 'dur' }],
      rows: g.map((x) => ({ id: x.vmid, name: x.name, state: x.running ? 'running' : 'stopped', cpu: x.cpu, mem: x.memUsed, memPct: x.memPct, disk: x.diskUsed, diskPct: x.diskPct, rx: x.rx, tx: x.tx, uptime: x.uptime })) },
    { kind: 'chart', title: 'CPU % - top 8 guests', fmt: 'pct', series: cpuH.map((x) => ({ name: x.labels.name, values: x.values })) },
    { kind: 'chart', title: 'Memory - top 8 guests', fmt: 'bytes', series: memH.map((x) => ({ name: x.labels.name, values: x.values })) },
  ] };
}

const PORT_NAMES = { 443: 'HTTPS', 80: 'HTTP', 53: 'DNS', 853: 'DNS-over-TLS', 123: 'NTP', 22: 'SSH', 25: 'SMTP', 993: 'IMAPS', 8443: 'alt HTTPS', 5228: 'Google push', 3478: 'STUN', 1883: 'MQTT', 8883: 'MQTT TLS', 51820: 'WireGuard' };
const rangeName = (s) => (s >= 604800 ? '7 days' : s >= 86400 ? '24 hours' : s >= 21600 ? '6 hours' : '1 hour');

const KINDS = { traffic, wifi, docker, capacity };
async function get(name, secs, ip) {
  if (name === 'device') { return device(String(ip || ''), secs); }
  if (!KINDS[name]) throw Object.assign(new Error('Unknown dashboard'), { status: 404 });
  const key = `${name}:${secs}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const data = { ...(await KINDS[name](secs)), generatedAt: Date.now(), range: secs };
  cache.set(key, { at: Date.now(), data });
  return data;
}

module.exports = { get };
