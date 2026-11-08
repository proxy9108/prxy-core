// Turns raw infrastructure data into a list of red/amber/green findings for
// the Overview page. Each check is independent so one failing source can't
// blank the whole board.
const obs = require('./observe');
const pg = require('./pg');
const pve = require('./pve');
const security = require('./security');
const bridge = require('./bridge');
const fwwatch = require('./fwwatch');
const unifistats = require('./unifistats');

const pct = (x) => `${Math.round(x * 100)}%`;
const DISK_WARN = 0.80;
const DISK_CRIT = 0.92;

async function settle(fn) {
  try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: e.message }; }
}

async function statusBoard() {
  const [infra, ctrs, tgts, rules, am, probes, pgh, logs, pwr, bk, sec, dk] = await Promise.all([
    settle(obs.infrastructure), settle(obs.containers), settle(obs.targets), settle(obs.ruleCount),
    settle(obs.alerts), settle(obs.probeAll), settle(pg.health), settle(obs.lokiFreshness), settle(() => obs.power(3600)),
    pve.configured() ? settle(pve.backups) : Promise.resolve({ ok: false, error: 'not configured' }),
    settle(security.overviewFacts),
    bridge.configured() ? settle(bridge.list) : Promise.resolve({ ok: false, error: 'not configured' }),
  ]);
  const checks = [];
  const add = (level, area, title, detail, link) => checks.push({ level, area, title, detail: detail || '', link: link || null });
  const sourceDown = (area, name, r, link) => add('red', area, `${name} unreachable`, r.error, link);

  // Proxmox guests
  if (infra.ok) {
    const { guests, pools, host } = infra.value;
    if (host.up === false) add('red', 'Proxmox', 'Proxmox host reports down', host.name, '#/infra');
    const downExpected = guests.filter((g) => !g.running && g.onboot);
    const downByChoice = guests.filter((g) => !g.running && !g.onboot);
    downExpected.forEach((g) => add('red', 'Proxmox', `${g.name} (${g.vmid}) is stopped`, 'It is set to start on boot, so it is expected to be running.', `#/infra/${g.vmid}`));
    if (downByChoice.length) add('info', 'Proxmox', `${downByChoice.length} guest(s) stopped by choice`, downByChoice.map((g) => g.name).join(', '), '#/infra');
    for (const g of guests.filter((x) => x.running)) {
      if (g.diskPct >= DISK_CRIT) add('red', 'Disk', `${g.name} disk ${pct(g.diskPct)} full`, 'Services fail when the disk fills. Free space or grow the disk.', `#/infra/${g.vmid}`);
      else if (g.diskPct >= DISK_WARN) add('amber', 'Disk', `${g.name} disk ${pct(g.diskPct)} full`, 'Getting close - check what is growing.', `#/infra/${g.vmid}`);
      if (g.memPct >= 0.95) add('amber', 'Memory', `${g.name} memory ${pct(g.memPct)} used`, '', `#/infra/${g.vmid}`);
    }
    for (const p of pools) {
      if (p.pct >= DISK_CRIT) add('red', 'Storage', `Storage pool ${p.name} ${pct(p.pct)} full`, '', '#/infra');
      else if (p.pct >= DISK_WARN) add('amber', 'Storage', `Storage pool ${p.name} ${pct(p.pct)} full`, '', '#/infra');
    }
    if (host.rootPct >= DISK_WARN * 100) add(host.rootPct >= DISK_CRIT * 100 ? 'red' : 'amber', 'Storage', `Proxmox root disk ${Math.round(host.rootPct)}% full`, '', '#/infra');
    // Guests that are meant to run must be in a backup job; ones stopped by choice are just noted.
    const unprotected = guests.filter((g) => !g.backedUp && (g.running || g.onboot));
    const parked = guests.filter((g) => !g.backedUp && !g.running && !g.onboot);
    if (unprotected.length) {
      add('red', 'Backups', `${unprotected.length} guest(s) not in any backup job`, unprotected.map((g) => g.name).join(', '), '#/backups');
    }
    if (parked.length) add('info', 'Backups', `${parked.length} stopped guest(s) excluded from nightly backups`, `${parked.map((g) => g.name).join(', ')} - use "Back up now" before changing them.`, '#/backups');
  } else sourceDown('Proxmox', 'Proxmox metrics', infra, '#/monitoring');

  // Docker
  if (ctrs.ok) {
    // cAdvisor remembers containers for a while after they are removed (docker rm, or one-off `docker run --rm`).
    // When the bridge can list what exists, only containers that still exist count as stopped; removed ones are a note.
    const exists = dk.ok ? new Set(dk.value.map((c) => c.name)) : null;
    const stopped = ctrs.value.filter((c) => !c.running);
    stopped.filter((c) => !exists || exists.has(c.name)).forEach((c) => add('red', 'Docker', `Container ${c.name} stopped`,
      `Last seen ${Math.round(c.lastSeenAgo / 60)} min ago on mgmt-docker.`, '#/docker'));
    const gone = exists ? stopped.filter((c) => !exists.has(c.name)) : [];
    if (gone.length) add('info', 'Docker', `${gone.length} removed container(s) still in recent metrics`, gone.map((c) => c.name).join(', '), '#/docker');
  } else sourceDown('Docker', 'Container metrics', ctrs, '#/monitoring');

  // Docker health from the bridge (cadvisor cannot see health checks or restart loops)
  if (dk.ok) {
    dk.value.filter((c) => c.health === 'unhealthy').forEach((c) => add('red', 'Docker', `Container ${c.name} is unhealthy`, 'Its health check is failing.', '#/docker'));
    // RestartCount is a lifetime total, so only flag containers restarting now or that restarted within the last hour.
    dk.value.filter((c) => c.running || c.restarting).filter((c) => c.restarting || (c.restartCount >= 3 && Date.now() - new Date(c.startedAt).getTime() < 3600000))
      .forEach((c) => add('amber', 'Docker', `Container ${c.name} is restarting`, `${c.restartCount} restarts so far.`, '#/docker'));
  }

  // Monitoring stack
  if (tgts.ok) {
    tgts.value.filter((t) => t.health !== 'up').forEach((t) => add('red', 'Monitoring', `Scrape target ${t.job} is ${t.health}`, t.lastError || t.url, '#/monitoring'));
  } else sourceDown('Monitoring', 'Prometheus', tgts, '#/monitoring');
  if (rules.ok && rules.value === 0) {
    add('amber', 'Monitoring', 'Prometheus has no alert rules', 'Alertmanager can never fire. Prxy Core checks still run here.', '#/monitoring');
  }
  if (am.ok) {
    am.value.alerts.filter((a) => a.state === 'active').forEach((a) => add(a.severity === 'critical' ? 'red' : 'amber', 'Alerts', a.name, a.summary, '#/monitoring'));
  } else sourceDown('Alerts', 'Alertmanager', am, '#/monitoring');
  if (logs.ok) {
    logs.value.filter((l) => l.lastWeek > 1000 && l.lastHour === 0).forEach((l) => add('amber', 'Logs',
      `Log feed "${l.job}" went quiet`, `${l.lastWeek.toLocaleString()} lines in the last day, none in the last hour - check its shipper.`, '#/monitoring'));
  } else sourceDown('Logs', 'Loki', logs, '#/monitoring');

  // Backup freshness (job coverage is checked above via pve-exporter)
  if (bk.ok) {
    const job = bk.value.jobs[0];
    const excluded = new Set((job && job.exclude ? job.exclude.split(',') : []).map(Number));
    const latest = {};
    bk.value.files.forEach((f) => { latest[f.vmid] = Math.max(latest[f.vmid] || 0, f.ctime); });
    const now = Date.now() / 1000;
    const stale = (infra.ok ? infra.value.guests : []).filter((g) => !excluded.has(g.vmid) && (!latest[g.vmid] || now - latest[g.vmid] > 26 * 3600));
    if (stale.length) add('red', 'Backups', `${stale.length} guest(s) without a backup in the last 26 h`, stale.map((g) => g.name).join(', '), '#/backups');
    const failed = bk.value.tasks.filter((t) => t.status !== 'OK' && t.status !== 'running' && now - t.start < 2 * 86400);
    if (failed.length) add('red', 'Backups', `${failed.length} backup run(s) failed in the last 2 days`, failed.map((t) => `${t.vmid || 'all'}: ${t.status}`).join('; '), '#/backups');
  }

  // Exposure of the household's own domains (lib/exposure.js; daily check)
  try {
    for (const d of require('./exposure').overviewFacts()) {
      if (d.dmarcMissing) add('amber', 'Exposure', `${d.domain} has no DMARC record`, d.spfMissing ? 'No SPF either: anyone can send email that claims to come from this domain.' : 'Others can send email that claims to come from this domain.', '#/recon/exposure');
      if (d.daysLeft != null && d.daysLeft < 30) add(d.daysLeft < 7 ? 'red' : 'amber', 'Exposure', `${d.domain} expires in ${d.daysLeft} day(s)`, 'Renew it at the registrar.', '#/recon/exposure');
      if (d.newNames.length) add('info', 'Exposure', `${d.newNames.length} new name(s) in public certificate logs for ${d.domain}`, d.newNames.slice(0, 5).join(', '), '#/recon/exposure');
    }
  } catch (e) { /* exposure not ready yet */ }

  // Security
  if (sec.ok) {
    const v = sec.value;
    if (v.newWifi > 0) add('amber', 'Security', `${v.newWifi} new Wi-Fi device${v.newWifi > 1 ? 's' : ''} to review`, 'Seen since the baseline was taken. Phones with private Wi-Fi addresses can look new when the address rotates.', '#/security');
    if (v.logins) {
      if (v.logins.fail_1h >= 20) add('red', 'Security', `${v.logins.fail_1h} failed AutoTrack logins in the last hour`, 'Possible password guessing - see which addresses are involved.', '#/security');
      else if (v.logins.topIps.some((x) => x.failures >= 10 && new Date(x.last).getTime() > Date.now() - 86400000)) add('amber', 'Security', 'One address has 10+ failed AutoTrack logins in 24 hours', v.logins.topIps[0].ip_address, '#/security');
    }
    if (v.ids && v.ids.total != null && v.ids.alerts7d === 0) add('info', 'Security', 'No intrusion alerts received from Suricata in 7 days', 'Either the network is quiet or alerts are not reaching Loki - see Security.', '#/security');
  }

  // UniFi network gear
  const uf = unifistats.snapshot();
  if (uf.ok) {
    uf.devices.filter((d) => d.state !== 1).forEach((d) => add('red', 'Network', `UniFi device ${d.name} is not connected`, `${d.type === 'uap' ? 'Access point' : 'Switch'} at ${d.ip || 'unknown address'}.`, '#/network'));
    uf.devices.filter((d) => d.type === 'usw' && d.poeMaxW && d.poeUsedW / d.poeMaxW > 0.9).forEach((d) => add('amber', 'Network', `${d.name} PoE budget ${Math.round((d.poeUsedW / d.poeMaxW) * 100)}% used`, '', '#/network'));
    uf.devices.filter((d) => d.type === 'usw').forEach((d) => d.ports.filter((p) => p.up && !p.isUplink && p.speedMbps && p.speedMbps < 1000 && p.attached.some((a) => a.kind === 'device')).forEach((p) => add('amber', 'Network', `${d.name} port ${p.idx} linked at only ${p.speedMbps} Mbps`, `Connected to ${p.attached.map((a) => a.name).join(', ')} - check the cable.`, '#/network')));
  }

  // Firewall rule changes
  try {
    const fr = fwwatch.rulesSummary();
    if (fr.shadowed && fr.shadowed.length) add('amber', 'Firewall', `${fr.shadowed.length} firewall rule${fr.shadowed.length > 1 ? 's' : ''} can never match`, fr.shadowed.map((x) => `${x.interface}: "${x.rule}" is below ${x.covers}`).slice(0, 2).join('; '), '#/network');
    if (fr.changes.length) add('amber', 'Firewall', `${fr.changes.length} firewall rule change${fr.changes.length > 1 ? 's' : ''} to review`, fr.changes.slice(0, 3).map((c) => `${c.state}: ${c.description || c.text}`).join('; '), '#/network');
  } catch { /* firewall watch not ready */ }

  // Power
  if (pwr.ok) {
    const p = pwr.value;
    if (p.stale) add('info', 'Power', 'UPS readings are not live (monitoring skipped by choice)', `Last reading ${p.lastSeenAgo == null ? 'never' : Math.round(p.lastSeenAgo / 3600) + ' h ago'}. The UPS only reports when something asks it, so a power cut could go unnoticed. The exporter itself is healthy - it needs to poll the UPS.`, '#/power');
    else if (p.onBattery) add('red', 'Power', `Running on battery - ${Math.round(p.battery)}%`, `About ${Math.round(p.runtimeS / 60)} min left at ${Math.round(p.outputW)} W.`, '#/power');
    else if (p.battery != null && p.battery < 50) add('amber', 'Power', `UPS battery at ${Math.round(p.battery)}%`, '', '#/power');
  }

  // Web UIs
  if (probes.ok) {
    probes.value.filter((p) => !p.ok).forEach((p) => add('red', 'Services', `${p.name} not responding`, `${p.url} - ${p.error || 'HTTP ' + p.status}`, '#/infra'));
  }

  // Databases
  if (pgh.ok) {
    const s = pgh.value.server;
    if (s.connections / s.max_connections > 0.8) add('amber', 'Databases', `Postgres at ${s.connections}/${s.max_connections} connections`, '', '#/health');
    if (pgh.value.waiting_locks) add('amber', 'Databases', `${pgh.value.waiting_locks} queries waiting on locks`, '', '#/health');
  } else sourceDown('Databases', 'PostgreSQL', pgh, '#/health');

  const order = { red: 0, amber: 1, info: 2 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  const counts = { red: 0, amber: 0, info: 0 };
  checks.forEach((c) => { counts[c.level]++; });

  return {
    checks, counts,
    summary: {
      guests: infra.ok ? { total: infra.value.guests.length, running: infra.value.guests.filter((g) => g.running).length } : null,
      containers: ctrs.ok ? { total: ctrs.value.length, running: ctrs.value.filter((c) => c.running).length } : null,
      services: probes.ok ? { total: probes.value.length, up: probes.value.filter((p) => p.ok).length } : null,
      targets: tgts.ok ? { total: tgts.value.length, up: tgts.value.filter((t) => t.health === 'up').length } : null,
      host: infra.ok ? infra.value.host : null,
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { statusBoard };
