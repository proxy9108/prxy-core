// Firewall watch: (1) remembers the rule list and flags changes, (2) keeps a history of blocked
// traffic from the firewall log. Both are read-only views of OPNsense; only Prxy Core's own SQLite changes.
const op = require('./opnsense');
const { db } = require('./store');

db.exec(`
CREATE TABLE IF NOT EXISTS fw_rules2 (key TEXT PRIMARY KEY, sig TEXT NOT NULL, info TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'ok',
  known INTEGER NOT NULL DEFAULT 0, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS fw_blocks (digest TEXT PRIMARY KEY, ts INTEGER NOT NULL, iface TEXT, src TEXT, dst TEXT, sport INTEGER, dport INTEGER,
  proto TEXT, label TEXT, action TEXT);
CREATE INDEX IF NOT EXISTS fw_blocks_ts ON fw_blocks (ts);
CREATE TABLE IF NOT EXISTS fw_block_stats (hour INTEGER NOT NULL, iface TEXT NOT NULL DEFAULT '', proto TEXT NOT NULL DEFAULT '',
  dport INTEGER NOT NULL DEFAULT 0, action TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL, PRIMARY KEY (hour, iface, proto, dport, action));
`);

const RULE_EVERY_MS = 5 * 60 * 1000;
const LOG_EVERY_MS = 30 * 1000;
// Owner policy (2026-10-18): raw blocks name devices (src/dst addresses), so they are kept 24 h only.
// Before deletion they are rolled up per hour into fw_block_stats, which holds no addresses.
const KEEP_RAW_SECS = 24 * 3600;
const KEEP_STATS_DAYS = 400;
const SIG_FIELDS = ['interface', 'direction', 'action', 'ipprotocol', 'protocol', 'source_net', 'source_port', 'destination_net', 'destination_port', 'enabled', 'quick', 'log', 'description'];

const crypto = require('crypto');
const isAuto = (r) => r.is_automatic === true || r.is_automatic === '1' || r.is_automatic === 1;
const flat = (v) => (Array.isArray(v) ? v.join(',') : v == null ? '' : String(v));
const summarize = (r) => `${flat(r.interface) || 'floating'} ${flat(r.direction)} ${flat(r.action) || '-'} ${flat(r.protocol) || 'any'} ${flat(r.source_net) || 'any'} → ${flat(r.destination_net) || 'any'}${r.destination_port ? ':' + flat(r.destination_port) : ''}${r.enabled === '0' || r.enabled === 0 || r.enabled === false ? ' [disabled]' : ''}`;

let status = { rules: { at: 0, error: null }, log: { at: 0, error: null } };
let shadowed = [];

// A quick rule that matches all traffic from an interface hides every rule placed after it.
function findShadowed(rows) {
  const byIf = {};
  for (const r of rows) { if (isAuto(r) || !r.interface) continue; (byIf[flat(r.interface)] = byIf[flat(r.interface)] || []).push(r); }
  const out = [];
  for (const [iface, list] of Object.entries(byIf)) {
    list.sort((a, b) => parseFloat(a.sort_order || 0) - parseFloat(b.sort_order || 0));
    let cover = null;
    for (const r of list) {
      if (cover) out.push({ interface: iface, rule: flat(r.description) || summarize(r), action: flat(r.action), covers: cover });
      const quick = r.quick === undefined || r.quick === '1' || r.quick === 1 || r.quick === true;
      const open = (v) => ['', 'any'].includes(flat(v).toLowerCase());
      const wholeNet = (v) => open(v) || /^opt\d+$/.test(flat(v));
      if (!cover && quick && open(r.protocol) && !flat(r.source_port) && !flat(r.destination_port) && wholeNet(r.source_net) && open(r.destination_net)) cover = `${flat(r.action)} any${flat(r.description) ? ` ("${flat(r.description)}")` : ''}`;
    }
  }
  return out;
}

async function collectRules() {
  try {
    const all = await op.rules();
    shadowed = findShadowed(all);
    const live = all.filter((r) => !isAuto(r));
    const now = Math.floor(Date.now() / 1000);
    const baseline = db.prepare('SELECT COUNT(*) AS n FROM fw_rules2').get().n === 0;
    const seen = new Set();
    db.transaction(() => {
      for (const r of live) {
        const sig = JSON.stringify(SIG_FIELDS.map((f) => flat(r[f])));
        // Legacy rules get a new id every time they are saved, so identify them by their content instead.
        const isLegacy = r.legacy === true || r.legacy === '1' || r.legacy === 1;
        const key = isLegacy ? `L:${crypto.createHash('sha1').update(sig).digest('hex').slice(0, 16)}` : (flat(r.uuid) || flat(r.ref) || summarize(r));
        const info = JSON.stringify({ text: summarize(r), description: flat(r.description) });
        seen.add(key);
        const row = db.prepare('SELECT sig, state FROM fw_rules2 WHERE key = ?').get(key);
        if (!row) db.prepare('INSERT INTO fw_rules2 (key, sig, info, state, known, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)').run(key, sig, info, baseline ? 'ok' : 'new', baseline ? 1 : 0, now, now);
        else if (row.sig !== sig) db.prepare("UPDATE fw_rules2 SET sig = ?, info = ?, state = 'changed', known = 0, last_seen = ? WHERE key = ?").run(sig, info, now, key);
        else db.prepare("UPDATE fw_rules2 SET last_seen = ?, state = CASE WHEN state = 'removed' THEN 'new' ELSE state END, known = CASE WHEN state = 'removed' THEN 0 ELSE known END WHERE key = ?").run(now, key);
      }
      for (const row of db.prepare("SELECT key FROM fw_rules2 WHERE state <> 'removed'").all()) {
        if (!seen.has(row.key)) db.prepare("UPDATE fw_rules2 SET state = 'removed', known = 0, last_seen = ? WHERE key = ?").run(now, row.key);
      }
    })();
    status.rules = { at: Date.now(), error: null };
  } catch (e) { status.rules = { at: Date.now(), error: e.message }; }
}

const rollUp = db.prepare(`INSERT INTO fw_block_stats (hour, iface, proto, dport, action, n)
  SELECT (ts / 3600) * 3600, COALESCE(iface, ''), COALESCE(proto, ''), COALESCE(dport, 0), COALESCE(action, ''), COUNT(*)
    FROM fw_blocks WHERE ts < ? GROUP BY 1, 2, 3, 4, 5
  ON CONFLICT (hour, iface, proto, dport, action) DO UPDATE SET n = n + excluded.n`);
const insBlock = db.prepare('INSERT OR IGNORE INTO fw_blocks (digest, ts, iface, src, dst, sport, dport, proto, label, action) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
async function collectLog() {
  try {
    const log = await op.firewallLog();
    const blocks = log.filter((x) => x.action === 'block' || x.action === 'reject');
    const cutoff = Math.floor(Date.now() / 1000) - KEEP_RAW_SECS;
    db.transaction(() => {
      for (const x of blocks) {
        const ts = Math.floor(Date.parse(x.__timestamp__) / 1000) || Math.floor(Date.now() / 1000);
        if (ts < cutoff) continue; // already rolled up (or too old to keep) - never store it again
        insBlock.run(x.__digest__ || `${ts}${x.src}${x.dst}${x.srcport}${x.dstport}`, ts, x.interface || null, x.src || null, x.dst || null, Number(x.srcport) || null, Number(x.dstport) || null, x.protoname || null, x.label || null, x.action);
      }
      rollUp.run(cutoff);
      db.prepare('DELETE FROM fw_blocks WHERE ts < ?').run(cutoff);
      db.prepare('DELETE FROM fw_block_stats WHERE hour < ?').run(cutoff - KEEP_STATS_DAYS * 86400);
    })();
    status.log = { at: Date.now(), error: null };
  } catch (e) { status.log = { at: Date.now(), error: e.message }; }
}

function start() {
  if (!op.configured()) return;
  collectRules(); collectLog();
  setInterval(collectRules, RULE_EVERY_MS).unref();
  setInterval(collectLog, LOG_EVERY_MS).unref();
}

const isLan = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip || '');

function blockSummary(hours = 24) {
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const q = (sql, ...a) => db.prepare(sql).all(since, ...a);
  const total = db.prepare('SELECT COUNT(*) AS n FROM fw_blocks WHERE ts >= ?').get(since).n;
  const byIface = q('SELECT iface, COUNT(*) AS n FROM fw_blocks WHERE ts >= ? GROUP BY iface ORDER BY n DESC');
  const topPorts = q('SELECT proto, dport, COUNT(*) AS n, COUNT(DISTINCT src) AS sources FROM fw_blocks WHERE ts >= ? AND dport IS NOT NULL GROUP BY proto, dport ORDER BY n DESC LIMIT 8');
  const topSources = q('SELECT src, COUNT(*) AS n, COUNT(DISTINCT dport) AS ports FROM fw_blocks WHERE ts >= ? GROUP BY src ORDER BY n DESC LIMIT 8').map((r) => ({ ...r, lan: isLan(r.src) }));
  const byRule = q('SELECT label, COUNT(*) AS n FROM fw_blocks WHERE ts >= ? GROUP BY label ORDER BY n DESC LIMIT 6');
  const perHour = q("SELECT (ts / 3600) * 3600 AS t, COUNT(*) AS n FROM fw_blocks WHERE ts >= ? GROUP BY t ORDER BY t").map((r) => [r.t, r.n]);
  const lanSources = db.prepare('SELECT COUNT(DISTINCT src) AS n FROM fw_blocks WHERE ts >= ?').get(since);
  const recent = db.prepare('SELECT ts, iface, src, dst, dport, proto, label FROM fw_blocks ORDER BY ts DESC LIMIT 15').all();
  const firstTs = db.prepare('SELECT MIN(ts) AS t FROM fw_blocks').get().t;
  const daily = db.prepare(`SELECT (hour / 86400) * 86400 AS d, SUM(n) AS n FROM fw_block_stats WHERE hour >= ? GROUP BY d ORDER BY d`)
    .all(Math.floor(Date.now() / 1000) - 30 * 86400).map((r) => [r.d, r.n]);
  return { daily30d: daily, hours, total, byIface, topPorts, topSources, byRule, perHour, recent, distinctSources: lanSources.n, collectingSince: firstTs, status: status.log };
}

function rulesSummary() {
  const rows = db.prepare('SELECT * FROM fw_rules2').all();
  const parse = (r) => ({ key: r.key, state: r.state, known: !!r.known, ...JSON.parse(r.info), firstSeen: r.first_seen, lastSeen: r.last_seen });
  return { total: rows.filter((r) => r.state !== 'removed').length, changes: rows.filter((r) => !r.known).map(parse), shadowed, status: status.rules };
}

function acknowledge(keys, all) {
  const del = db.prepare("DELETE FROM fw_rules2 WHERE key = ? AND state = 'removed'");
  const upd = db.prepare("UPDATE fw_rules2 SET known = 1, state = 'ok' WHERE key = ? AND state <> 'removed'");
  const targets = all ? db.prepare('SELECT key FROM fw_rules2 WHERE known = 0').all().map((r) => r.key) : keys.slice(0, 200);
  return db.transaction(() => targets.reduce((n, k) => { n += upd.run(k).changes; n += del.run(k).changes; return n; }, 0))();
}

module.exports = { start, blockSummary, rulesSummary, acknowledge, collectRules, collectLog };
