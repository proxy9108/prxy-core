// Exposure check (2026-10-18): what the outside world can see about the household's own domains - mail security
// (SPF/DMARC), registration expiry and every name that has appeared in public certificate logs. Runs daily.
// Only domain facts are stored (no personal data), so the history is kept: new certificate names are flagged.
// Personal accounts (emails, usernames) are never stored - the Recon page looks them up on demand.
const { db } = require('./store');
const recon = require('./recon');

const DOMAINS = (process.env.EXPOSURE_DOMAINS || 'example.com,example.net').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
const EVERY_MS = 24 * 3600 * 1000;
const NEW_DAYS = 14;

db.exec(`
CREATE TABLE IF NOT EXISTS exposure_domains (domain TEXT PRIMARY KEY, checked_at INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exposure_names (domain TEXT NOT NULL, name TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  baseline INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (domain, name));
`);
const upsertName = db.prepare(`INSERT INTO exposure_names (domain, name, first_seen, last_seen, baseline) VALUES (@domain, @name, @now, @now, @baseline)
  ON CONFLICT (domain, name) DO UPDATE SET last_seen = @now`);
let running = null;

async function checkDomain(domain) {
  let pub = await recon.domainPublic(domain, { allNames: true });
  if (pub.errors.certificates) { // crt.sh is often overloaded: one retry after a pause
    await new Promise((r) => setTimeout(r, 20000));
    const again = await recon.domainPublic(domain, { allNames: true });
    if (!again.errors.certificates) pub = again;
  }
  const now = Math.floor(Date.now() / 1000);
  if (pub.certificates) {
    const first = db.prepare('SELECT COUNT(*) AS n FROM exposure_names WHERE domain = ?').get(domain).n === 0;
    db.transaction(() => { for (const name of pub.certificates.allNames || pub.certificates.names) upsertName.run({ domain, name, now, baseline: first ? 1 : 0 }); })();
  }
  db.prepare('INSERT INTO exposure_domains (domain, checked_at, data) VALUES (?, ?, ?) ON CONFLICT (domain) DO UPDATE SET checked_at = excluded.checked_at, data = excluded.data')
    .run(domain, now, JSON.stringify({ mail: pub.mail, registration: pub.registration || null, dns: pub.dns, certificates: pub.certificates ? { valid: pub.certificates.valid, newestIssued: pub.certificates.newestIssued, totalNames: pub.certificates.totalNames } : null, errors: pub.errors }));
}

function runAll() {
  if (running) return running;
  running = (async () => { for (const d of DOMAINS) { try { await checkDomain(d); } catch (e) { console.error('exposure:', d, e.message); } } })().finally(() => { running = null; });
  return running;
}

function summary() {
  const cutoff = Math.floor(Date.now() / 1000) - NEW_DAYS * 86400;
  return {
    domains: DOMAINS.map((domain) => {
      const row = db.prepare('SELECT checked_at, data FROM exposure_domains WHERE domain = ?').get(domain);
      const names = db.prepare('SELECT name, first_seen, last_seen, baseline FROM exposure_names WHERE domain = ? ORDER BY name').all(domain);
      const d = row ? JSON.parse(row.data) : null;
      const expires = d && d.registration && d.registration.expires ? new Date(d.registration.expires) : null;
      return {
        domain, checkedAt: row ? row.checked_at : null, ...(d || {}),
        daysLeft: expires ? Math.floor((expires - Date.now()) / 86400000) : null,
        names: names.map((n) => ({ name: n.name, firstSeen: n.first_seen, isNew: !n.baseline && n.first_seen >= cutoff })),
      };
    }),
    running: !!running,
    newDays: NEW_DAYS,
  };
}

// Facts for the Overview page (lib/checks.js).
function overviewFacts() {
  return summary().domains.filter((d) => d.checkedAt).map((d) => ({
    domain: d.domain, dmarcMissing: !!(d.mail && !d.mail.dmarc), spfMissing: !!(d.mail && !d.mail.spf),
    daysLeft: d.daysLeft, newNames: d.names.filter((n) => n.isNew).map((n) => n.name),
  }));
}

function start() {
  setTimeout(() => runAll(), 90 * 1000).unref();
  setInterval(() => runAll(), EVERY_MS).unref();
}

module.exports = { start, runAll, summary, overviewFacts, DOMAINS };
