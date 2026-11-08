// Live traffic for the Net View: per-VLAN bandwidth from NetFlow, Wi-Fi clients from UniFi events.
// Only LAN-side flow records are used (one end inside 192.168.x.x) so traffic is not double
// counted with the router's post-NAT records.
const obs = require('./observe');
const net = require('./network');
const ifstats = require('./ifstats');
const fwwatch = require('./fwwatch');
const unifistats = require('./unifistats');

const WINDOWS = [60, 300, 900, 3600];
// Anything that is not a routable internet address (RFC1918, loopback, link-local, CGNAT, multicast, reserved).
const NON_PUBLIC = '(10|127|169\\\\.254|192\\\\.168|172\\\\.(1[6-9]|2[0-9]|3[01])|100\\\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])|22[4-9]|23[0-9]|24[0-9]|25[0-5])\\\\..*';
const LAN = '192\\\\.168\\\\..*';

// OPNsense exports outbound traffic after NAT, so uploads show up under the single WAN address
// (carrier-grade NAT range 100.64.0.0/10 on Starlink) and cannot be attributed to a VLAN.
const WAN_SRC = '100\\\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\\\..*';
const q = {
  wanUp: (w) => `sum(sum_over_time({job="netflow"} | json | src_addr=~"${WAN_SRC}" | dst_addr!~"${NON_PUBLIC}" | unwrap bytes [${w}s]))`,
  down: (w) => `sum by (dst_addr) (sum_over_time({job="netflow"} | json | dst_addr=~"${LAN}" | src_addr!~"${NON_PUBLIC}" | unwrap bytes [${w}s]))`,
  local: (w) => `sum by (src_addr, dst_addr) (sum_over_time({job="netflow"} | json | src_addr=~"${LAN}" | dst_addr=~"${LAN}" | unwrap bytes [${w}s]))`,
  wifi: '(sum by (ap_name, ssid, network_name, network_vlan, client_mac) (count_over_time({job="unifi_siem"} | client_mac != "" | ap_name != "" [6h])))',
};

const vlanOf = (ip) => Number((ip || '').split('.')[2]);
const mbps = (bytes, w) => (bytes * 8) / w / 1e6;

let cache = new Map();

async function build(w) {
  const [wanUp, down, local, wifi] = await Promise.all([
    obs.lokiVector(q.wanUp(w), 60000).catch(() => []),
    obs.lokiVector(q.down(w), 60000).catch(() => []),
    obs.lokiVector(q.local(w), 60000).catch(() => []),
    obs.lokiVector(q.wifi, 60000).catch(() => []),
  ]);
  const vl = Object.fromEntries(net.vlans.map((v) => [v.id, { ...v, downBytes: 0, localBytes: 0, hosts: new Set(), talkers: {} }]));
  const other = { downBytes: 0 };
  const talk = (v, ip, bytes) => { v.talkers[ip] = (v.talkers[ip] || 0) + bytes; v.hosts.add(ip); };

  for (const { labels: l, value } of down) { const v = vl[vlanOf(l.dst_addr)]; if (v) { v.downBytes += value; talk(v, l.dst_addr, value); } else other.downBytes += value; }
  const between = {};
  for (const { labels: l, value } of local) {
    const a = vlanOf(l.src_addr); const b = vlanOf(l.dst_addr);
    if (vl[a]) { vl[a].hosts.add(l.src_addr); vl[a].localBytes += value; }
    if (vl[b]) vl[b].hosts.add(l.dst_addr);
    if (a !== b) { const k = `${a}>${b}`; between[k] = (between[k] || 0) + value; }
  }

  // Wi-Fi: devices seen in the last 6 h per AP and per SSID
  const aps = {}; const ssids = {};
  for (const { labels: l } of wifi) {
    const ap = l.ap_name || 'unknown AP';
    (aps[ap] = aps[ap] || new Set()).add(l.client_mac);
    const key = l.ssid || 'unknown SSID';
    ssids[key] = ssids[key] || { ssid: key, network: l.network_name || null, vlan: Number(l.network_vlan) || null, clients: new Set(), aps: new Set() };
    ssids[key].clients.add(l.client_mac); ssids[key].aps.add(ap);
  }

  const vlans = Object.values(vl).map((v) => {
    const top = Object.entries(v.talkers).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ip, b]) => ({ ip, mbps: mbps(b, w) }));
    return { id: v.id, name: v.name, ident: v.ident, subnet: v.subnet, viaVpn: !!v.viaVpn, hosts: v.hosts.size,
      upMbps: null, downMbps: mbps(v.downBytes, w), localMbps: mbps(v.localBytes, w), top };
  });
  return {
    window: w,
    vlans,
    internet: { upMbps: wanUp[0] ? mbps(wanUp[0].value, w) : null, downMbps: mbps(vlans.reduce((a, v) => a + v.downMbps * w * 1e6 / 8, 0), w), unattributed: mbps(other.downBytes, w) },
    between: Object.entries(between).map(([k, b]) => { const [a, c] = k.split('>').map(Number); return { from: a, to: c, mbps: mbps(b, w) }; }).sort((x, y) => y.mbps - x.mbps),
    wifi: {
      aps: Object.entries(aps).map(([name, set]) => ({ name, clients: set.size })).sort((a, b) => b.clients - a.clients),
      ssids: Object.values(ssids).map((s) => ({ ssid: s.ssid, network: s.network, vlan: s.vlan, clients: s.clients.size, aps: [...s.aps] })).sort((a, b) => b.clients - a.clients),
    },
    opn: ifstats.snapshot(),
    unifi: unifistats.snapshot(),
    blocks: fwwatch.blockSummary(24),
    rules: fwwatch.rulesSummary(),
    generatedAt: new Date().toISOString(),
  };
}

async function snapshot(w) {
  const win = WINDOWS.includes(w) ? w : 300;
  const hit = cache.get(win);
  if (hit && Date.now() - hit.at < 20000) return hit.data;
  const data = await build(win);
  cache.set(win, { at: Date.now(), data });
  return data;
}

function staticModel() {
  return { exportedOn: net.exportedOn, wan: net.wan, trunk: net.trunk, vpn: net.vpn, vlans: net.vlans, switches: net.switches, wired: net.wired,
    policyColumns: net.policyColumns, policy: net.policy, policyNotes: net.policyNotes, findings: net.findings };
}

module.exports = { snapshot, staticModel, WINDOWS };
