// Polls UniFi every 30 s and builds a topology snapshot: switches with per-port state/traffic and what
// is attached to each port, access points with radios and SSIDs, and every connected client.
const unifi = require('./unifi');

const PERIOD_MS = 30000;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const bps = (bytesPerSec) => (Number.isFinite(Number(bytesPerSec)) ? Number(bytesPerSec) * 8 : null);

let state = { ok: false, error: 'not polled yet', updatedAt: null, devices: [], clients: [], networks: [], health: [] };

function build(devs, cls, nets, health) {
  const byMac = Object.fromEntries(devs.map((d) => [d.mac, d]));
  const vlanOfNet = Object.fromEntries(nets.map((n) => [n.name, n.vlan == null ? null : Number(n.vlan)]));
  const networks = nets.map((n) => ({ name: n.name, vlan: n.vlan == null ? null : Number(n.vlan), subnet: n.ip_subnet || null }));

  const clients = cls.map((c) => {
    const net = c.network || c.last_connection_network_name || null;
    return {
      mac: c.mac, ip: c.ip || c.last_ip || null, name: c.name || c.hostname || null, oui: c.oui || null,
      wired: !!c.is_wired, guest: !!c.is_guest, network: net, vlan: net in vlanOfNet ? vlanOfNet[net] : null,
      ssid: c.essid || null, apMac: c.ap_mac || null, apName: c.ap_mac && byMac[c.ap_mac] ? byMac[c.ap_mac].name : null,
      band: c.radio || null, channel: c.channel || null, signal: num(c.signal), txRateKbps: num(c.tx_rate), rxRateKbps: num(c.rx_rate),
      rxBps: bps(c['rx_bytes-r']), txBps: bps(c['tx_bytes-r']), satisfaction: num(c.satisfaction),
      swMac: c.sw_mac || null, swName: c.sw_mac && byMac[c.sw_mac] ? byMac[c.sw_mac].name : (c.last_uplink_name || null), swPort: num(c.sw_port || c.last_uplink_remote_port),
      uptime: num(c.uptime),
    };
  });
  const label = (c) => c.name || c.oui || c.mac;

  const devices = devs.map((d) => {
    const u = d.uplink || {};
    const base = {
      mac: d.mac, name: d.name || d.model, model: d.model, type: d.type, ip: d.ip || null, state: d.state, version: d.version || null, uptime: num(d.uptime),
      uplink: u.uplink_mac ? { mac: u.uplink_mac, name: byMac[u.uplink_mac] ? byMac[u.uplink_mac].name : null, port: num(u.uplink_remote_port), speedMbps: num(u.speed) } : null,
      clients: num(d.num_sta), satisfaction: num(d.satisfaction),
    };
    if (d.type === 'usw') {
      base.temp = num(d.general_temperature); base.poeUsedW = num(d.total_used_power); base.poeMaxW = num(d.total_max_power);
      base.ports = (d.port_table || []).map((p) => {
        const attached = [];
        for (const o of devs) {
          const ou = o.uplink || {};
          if (ou.uplink_mac === d.mac && num(ou.uplink_remote_port) === p.port_idx) attached.push({ kind: 'device', name: o.name || o.model, type: o.type });
        }
        for (const c of clients) if (c.wired && c.swMac === d.mac && c.swPort === p.port_idx && !byMac[c.mac]) attached.push({ kind: 'client', name: label(c) });
        return {
          idx: p.port_idx, name: p.name || null, up: !!p.up, speedMbps: num(p.speed), poe: !!(p.poe_enable && p.poe_good), poeW: num(p.poe_power),
          rxBps: bps(p['rx_bytes-r']), txBps: bps(p['tx_bytes-r']), errors: (num(p.rx_errors) || 0) + (num(p.tx_errors) || 0) + (num(p.rx_dropped) || 0) + (num(p.tx_dropped) || 0),
          macCount: num(p.mac_table_count), isUplink: !!p.is_uplink, stp: p.stp_state || null, attached,
        };
      });
    }
    if (d.type === 'uap') {
      base.radios = (d.radio_table_stats || []).map((r) => ({ band: r.radio, channel: r.channel, width: r.bw, clients: num(r.num_sta), utilPct: num(r.cu_total), retriesPct: num(r.tx_retries_pct), satisfaction: num(r.satisfaction), txPower: num(r.tx_power) }));
      base.ssids = (d.vap_table || []).filter((v) => v.state === 'RUN' || v.up).map((v) => ({ essid: v.essid, radio: v.radio, channel: v.channel, clients: num(v.num_sta), satisfaction: num(v.satisfaction), guest: !!v.is_guest }));
    }
    return base;
  });
  return { devices, clients, networks, health: health.map((h) => ({ subsystem: h.subsystem, status: h.status })) };
}

async function poll() {
  try {
    const [devs, cls, nets, health] = await Promise.all([unifi.devices(), unifi.clients(), unifi.networks(), unifi.health().catch(() => [])]);
    state = { ok: true, error: null, updatedAt: new Date().toISOString(), ...build(devs, cls, nets, health) };
  } catch (e) { state = { ...state, ok: false, error: e.message }; }
}

function start() {
  if (!unifi.configured()) { state = { ...state, error: 'UniFi not configured' }; return; }
  poll();
  setInterval(poll, PERIOD_MS).unref();
}

module.exports = { start, snapshot: () => state };
