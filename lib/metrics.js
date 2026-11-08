// Counts-only Prometheus metrics for Homepage's status tiles (owner decision 2026-10-18). No IPs, device names,
// emails or rule text ever appear here - only totals - so it fits the 24-hour / no-user-exposure policy, and
// Prometheus may keep the history. Served at GET /metrics to the Prometheus host only (see server.js), no login.
const checks = require('./checks');
const security = require('./security');
const fwwatch = require('./fwwatch');

const ALLOWED = new Set(['10.20.40.116', '::ffff:10.20.40.116', '127.0.0.1', '::1', '::ffff:127.0.0.1']);
const CACHE_MS = 55 * 1000; // statusBoard queries every source; one run per scrape interval is plenty
let cache = null;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function render() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.text;
  const out = [];
  const metric = (name, help, samples) => {
    const rows = samples.filter((s) => num(s.v) !== null);
    if (!rows.length) return;
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
    rows.forEach((s) => out.push(`${name}${s.l ? `{${Object.entries(s.l).map(([k, v]) => `${k}="${v}"`).join(',')}}` : ''} ${s.v}`));
  };
  const [board, logins] = await Promise.all([
    checks.statusBoard().catch(() => null),
    security.logins().catch(() => null),
  ]);
  if (board) {
    metric('prxy_overview_problems', 'Problems on the Prxy Core Overview page', [
      { l: { level: 'red' }, v: board.counts.red }, { l: { level: 'amber' }, v: board.counts.amber }]);
    const area = (a) => board.checks.filter((c) => c.area === a && (c.level === 'red' || c.level === 'amber')).length;
    metric('prxy_backup_problems', 'Backup problems (red or amber) on the Overview page', [{ v: area('Backups') }]);
  }
  const blocks = fwwatch.blockSummary(24);
  metric('prxy_fw_blocked_24h', 'Firewall blocks in the last 24 hours', [{ v: blocks.total }]);
  metric('prxy_fw_blocked_sources_24h', 'Distinct addresses blocked in the last 24 hours', [{ v: blocks.distinctSources }]);
  const rules = fwwatch.rulesSummary();
  metric('prxy_fw_rule_changes', 'Firewall rule changes not yet acknowledged', [{ v: rules.changes.length }]);
  metric('prxy_fw_rules_never_match', 'Firewall rules that can never match', [{ v: (rules.shadowed || []).length }]);
  const dev = security.devices();
  metric('prxy_devices_new', 'Devices not yet marked as known', [{ l: { kind: 'wifi' }, v: dev.newWifi }, { l: { kind: 'lan' }, v: dev.newLan }]);
  metric('prxy_devices_active_24h', 'Devices seen in the last 24 hours', [{ v: dev.active24h }]);
  if (logins) metric('prxy_autotrack_failed_logins_24h', 'Failed AutoTrack sign-ins in the last 24 hours', [{ v: logins.fail_24h }]);
  metric('prxy_metrics_generated_seconds', 'Unix time these numbers were computed', [{ v: Math.floor(Date.now() / 1000) }]);
  cache = { at: Date.now(), text: out.join('\n') + '\n' };
  return cache.text;
}

function handler(req, res) {
  if (!ALLOWED.has(req.socket.remoteAddress)) return res.status(403).type('text/plain').send('Forbidden\n');
  render().then((text) => res.type('text/plain; version=0.0.4').set('Cache-Control', 'no-store').send(text))
    .catch((e) => { console.error('metrics:', e); res.status(500).type('text/plain').send('error\n'); });
}

module.exports = { handler };
