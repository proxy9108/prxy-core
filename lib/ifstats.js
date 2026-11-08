// Polls OPNsense interface counters every 15 s and turns them into live rates. Counters are
// the router's own view, so unlike NetFlow they include everything (and are not hidden by NAT).
// "rx" is traffic received BY the router on that interface, "tx" is traffic sent out of it:
// on a VLAN, rx = what the clients upload, tx = what they download.
const op = require('./opnsense');
const { db } = require('./store');

const PERIOD_MS = 15000;
const SAVE_EVERY_MS = 60000;
const KEEP_DAYS = 14;

db.exec(`CREATE TABLE IF NOT EXISTS if_samples (ts INTEGER NOT NULL, dev TEXT NOT NULL, rx INTEGER NOT NULL, tx INTEGER NOT NULL, PRIMARY KEY (ts, dev))`);
const insert = db.prepare('INSERT OR IGNORE INTO if_samples (ts, dev, rx, tx) VALUES (?, ?, ?, ?)');

let state = { ok: false, error: 'not polled yet', updatedAt: null, interfaces: [], gateways: [], wan: null };
let prev = null; let lastSave = 0; let tick = 0;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const speedOf = (media) => { const m = /(\d+)(base|Gbase)/i.exec(media || ''); return m ? Number(m[1]) : null; };

async function poll() {
  try {
    const [rows, traffic] = await Promise.all([op.interfaces(), op.traffic()]);
    const now = Date.now();
    const byDev = {};
    for (const t of Object.values(traffic)) byDev[t.device || t.name] = { rx: num(t['bytes received']), tx: num(t['bytes transmitted']), link: t['link state'] };
    const rates = {};
    if (prev) {
      const dt = (now - prev.t) / 1000;
      for (const [dev, c] of Object.entries(byDev)) {
        const p = prev.byDev[dev];
        if (p && dt > 0 && c.rx >= p.rx && c.tx >= p.tx) rates[dev] = { rxBps: ((c.rx - p.rx) * 8) / dt, txBps: ((c.tx - p.tx) * 8) / dt };
      }
    }
    prev = { t: now, byDev };

    // Interfaces without counters of their own (e.g. the VLAN parent re1) are kept for link speed/status.
    const interfaces = rows.filter((r) => r.device && !/^(lo0|enc0|pflog0)$/.test(r.device)).map((r) => {
      const v4 = Array.isArray(r.ipv4) && r.ipv4[0] ? r.ipv4[0].ipaddr : null;
      const c = byDev[r.device];
      return {
        dev: r.device, ident: r.identifier || null, name: r.description || r.identifier || r.device, status: r.status, ip: v4 || null,
        speedMbps: speedOf(r.media), rxBytes: c ? c.rx : null, txBytes: c ? c.tx : null,
        rxBps: rates[r.device] ? rates[r.device].rxBps : null, txBps: rates[r.device] ? rates[r.device].txBps : null,
      };
    });

    // gateways change slowly - refresh once a minute
    let gateways = state.gateways;
    if (tick % 4 === 0) gateways = await op.gateways().catch(() => state.gateways);
    tick++;

    state = { ok: true, error: null, updatedAt: new Date(now).toISOString(), interfaces, gateways,
      wan: interfaces.find((i) => i.ident === 'wan') || null };

    if (now - lastSave >= SAVE_EVERY_MS) {
      lastSave = now;
      const ts = Math.floor(now / 1000);
      db.transaction(() => interfaces.filter((i) => i.rxBytes != null).forEach((i) => insert.run(ts, i.dev, i.rxBytes, i.txBytes)))();
      db.prepare('DELETE FROM if_samples WHERE ts < ?').run(ts - KEEP_DAYS * 86400);
    }
  } catch (e) {
    state = { ...state, ok: false, error: e.message };
  }
}

function start() {
  if (!op.configured()) { state = { ...state, error: 'OPNsense API not configured' }; return; }
  poll();
  setInterval(poll, PERIOD_MS).unref();
}

// Gateway numbers come as strings like "19.1 ms" / "0.0 %" ("~" = not monitored).
const snapshot = () => state;

module.exports = { start, snapshot };
