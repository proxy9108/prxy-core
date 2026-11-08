// Security signals: new devices (Wi-Fi via UniFi events, LAN via NetFlow), failed
// logins (AutoTrack DB + Prxy Core itself) and Suricata pipeline health.
// Everything here is read-only against external systems; the only thing written is
// Prxy Core's own device inventory in SQLite.
const obs = require('./observe');
const pg = require('./pg');
const { db } = require('./store');

const WIFI_Q = (w) => `sum by (client_mac, client_alias, client_ip, ssid, network_name, ap_name) (count_over_time({job="unifi_siem"} | client_mac != "" [${w}]))`;
const LAN_Q = (w) => `sum by (src_addr) (count_over_time({job="netflow"} | json | src_addr=~"192\\\\.168\\\\.[0-9]+\\\\.[0-9]+" | src_addr!~".*\\\\.(0|255)" [${w}]))`;
const COLLECT_EVERY_MS = 15 * 60 * 1000;

const upsert = db.prepare(`
  INSERT INTO devices (key, kind, name, ip, ssid, network, ap, first_seen, last_seen, known)
  VALUES (@key, @kind, @name, @ip, @ssid, @network, @ap, @now, @now, @known)
  ON CONFLICT(key) DO UPDATE SET last_seen = @now,
    ip = COALESCE(@ip, ip), ssid = COALESCE(@ssid, ssid), network = COALESCE(@network, network), ap = COALESCE(@ap, ap),
    name = CASE WHEN @name IS NOT NULL AND @name <> '' THEN @name ELSE name END`);

let lastCollect = { at: 0, error: null, baseline: false };

async function collectDevices() {
  try {
    // First run: everything seen recently becomes the trusted baseline, so you
    // are not flooded with every device you already own.
    const baseline = db.prepare('SELECT COUNT(*) AS n FROM devices').get().n === 0;
    const [wifi, lan] = await Promise.all([
      obs.lokiVector(WIFI_Q(baseline ? '13d' : '3h'), 60000),
      obs.lokiVector(LAN_Q(baseline ? '24h' : '3h'), 90000).catch(() => []),
    ]);
    const now = Math.floor(Date.now() / 1000);
    db.transaction(() => {
      for (const { labels: l } of wifi) {
        const mac = (l.client_mac || '').toLowerCase();
        if (!mac) continue;
        const alias = l.client_alias && l.client_alias.toLowerCase() !== mac && !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(l.client_alias) ? l.client_alias : null;
        upsert.run({ key: mac, kind: 'wifi', name: alias, ip: l.client_ip || null, ssid: l.ssid || null, network: l.network_name || null, ap: l.ap_name || null, now, known: baseline ? 1 : 0 });
      }
      for (const { labels: l } of lan) {
        if (!l.src_addr) continue;
        upsert.run({ key: l.src_addr, kind: 'lan', name: null, ip: l.src_addr, ssid: null, network: null, ap: null, now, known: baseline ? 1 : 0 });
      }
    })();
    lastCollect = { at: Date.now(), error: null, baseline };
  } catch (e) {
    lastCollect = { at: Date.now(), error: e.message, baseline: false };
    console.error('device collection failed:', e.message);
  }
}

function startCollector() {
  collectDevices();
  setInterval(collectDevices, COLLECT_EVERY_MS).unref();
}

function devices() {
  const rows = db.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all();
  const cutoff = Math.floor(Date.now() / 1000) - 86400;
  return {
    wifi: rows.filter((r) => r.kind === 'wifi'),
    lan: rows.filter((r) => r.kind === 'lan'),
    newWifi: rows.filter((r) => r.kind === 'wifi' && !r.known).length,
    newLan: rows.filter((r) => r.kind === 'lan' && !r.known).length,
    active24h: rows.filter((r) => r.last_seen >= cutoff).length,
    collector: lastCollect,
  };
}

function acknowledge(keys, all) {
  if (all) return db.prepare('UPDATE devices SET known = 1 WHERE known = 0').run().changes;
  const st = db.prepare('UPDATE devices SET known = 1 WHERE key = ?');
  return db.transaction((list) => list.reduce((n, k) => n + st.run(String(k)).changes, 0))(keys.slice(0, 500));
}

// ---------- failed logins ----------
async function logins() {
  const q = (sql) => pg.q('autotrack', sql).then((r) => r.rows);
  const [[counts], topIps, topEmails, [locked]] = await Promise.all([
    q(`SELECT count(*) FILTER (WHERE NOT successful AND attempted_at > now() - interval '1 hour')::int AS fail_1h,
              count(*) FILTER (WHERE NOT successful AND attempted_at > now() - interval '24 hours')::int AS fail_24h,
              count(*) FILTER (WHERE successful AND attempted_at > now() - interval '24 hours')::int AS ok_24h,
              count(*) FILTER (WHERE NOT successful AND attempted_at > now() - interval '24 hours')::int AS fail_7d
         FROM login_attempts`),
    q(`SELECT ip_address, count(*)::int AS failures, count(DISTINCT email)::int AS emails, max(attempted_at) AS last
         FROM login_attempts WHERE NOT successful AND attempted_at > now() - interval '24 hours'
        GROUP BY 1 ORDER BY failures DESC LIMIT 10`),
    q(`SELECT email, count(*)::int AS failures, count(DISTINCT ip_address)::int AS ips, max(attempted_at) AS last
         FROM login_attempts WHERE NOT successful AND attempted_at > now() - interval '24 hours'
        GROUP BY 1 ORDER BY failures DESC LIMIT 10`),
    q(`SELECT count(*)::int AS locked FROM users WHERE account_locked`),
  ]);
  const { db: sqlite } = require('./store');
  const own = sqlite.prepare(`SELECT ip, count(*) AS failures, max(ts) AS last FROM audit
     WHERE action = 'login' AND ok = 0 AND ts > datetime('now', '-1 day') GROUP BY ip ORDER BY failures DESC LIMIT 5`).all();
  return { ...counts, lockedAccounts: locked.locked, topIps, topEmails, prxyCoreFailures: own };
}

// ---------- Suricata pipeline ----------
let idsCache = { at: 0, data: null };
async function ids() {
  if (Date.now() - idsCache.at < 5 * 60 * 1000 && idsCache.data) return idsCache.data;
  const num = (expr) => obs.lokiVector(expr, 30000).then((r) => (r[0] ? r[0].value : 0)).catch(() => null);
  const ALERT_RE = 'Classification|Priority: [0-9]|\\\\[\\\\*\\\\*\\\\]';
  const [total, hour, alerts, alerts24] = await Promise.all([
    num('sum(count_over_time({job="suricata"}[7d]))'),
    num('sum(count_over_time({job="suricata"}[1h]))'),
    num(`sum(count_over_time({job="suricata"} |~ "${ALERT_RE}" [7d]))`),
    num(`sum(count_over_time({job="suricata"} |~ "${ALERT_RE}" [24h]))`),
  ]);
  let lastStart = null; let recent = [];
  try {
    const st = await obs.logs({ query: '{job="suricata"} |= "Engine started"', seconds: 7 * 86400, limit: 1 });
    lastStart = st.lines[0] ? st.lines[0].ts : null;
    if (alerts) recent = (await obs.logs({ query: `{job="suricata"} |~ "${ALERT_RE}"`, seconds: 7 * 86400, limit: 25 })).lines.map((l) => ({ ts: l.ts, line: l.line }));
  } catch { /* leave empty */ }
  const data = { total, lastHour: hour, alerts7d: alerts, alerts24h: alerts24, lastStart, recent };
  idsCache = { at: Date.now(), data };
  return data;
}

// Cheap facts for the Overview board.
async function overviewFacts() {
  const d = devices();
  const [l, i] = await Promise.all([logins().catch(() => null), ids().catch(() => null)]);
  return { newWifi: d.newWifi, logins: l, ids: i };
}

async function summary() {
  const [l, i] = await Promise.all([logins().catch((e) => ({ error: e.message })), ids().catch((e) => ({ error: e.message }))]);
  return { devices: devices(), logins: l, ids: i, generatedAt: new Date().toISOString() };
}

module.exports = { startCollector, collectDevices, devices, acknowledge, logins, ids, overviewFacts, summary };
