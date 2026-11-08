// Recon: "who is this IP / domain / email?" (2026-10-18). Looks in the lab's own data first (firewall blocks of the last
// 24 h, VLANs, guests, known devices), then in public records (reverse DNS, Team Cymru ASN, RDAP, DNS, crt.sh).
// Owner policy: identifying data is kept at most 24 h - results live in memory for 10 minutes and are never written to
// disk; the audit log records only the indicator type. Internal addresses and names are never sent to outside services.
const dns = require('dns').promises;
const { db } = require('./store');
const network = require('./network');
const { GUESTS } = require('./services');

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();
const resolver = new dns.Resolver({ timeout: 4000, tries: 2 });

// Pre-filled links to outside tools (same list as Homepage's OSINT panel). {v} = value, {e} = URL-encoded value.
const LINKS = {
  ip: [['Shodan', 'https://www.shodan.io/host/{v}'], ['AbuseIPDB', 'https://www.abuseipdb.com/check/{v}'], ['GreyNoise', 'https://viz.greynoise.io/ip/{v}'],
    ['VirusTotal', 'https://www.virustotal.com/gui/ip-address/{v}'], ['AlienVault OTX', 'https://otx.alienvault.com/indicator/ip/{v}'], ['Censys', 'https://search.censys.io/hosts/{v}']],
  domain: [['crt.sh', 'https://crt.sh/?q={v}'], ['VirusTotal', 'https://www.virustotal.com/gui/domain/{v}'], ['urlscan.io', 'https://urlscan.io/domain/{v}'],
    ['SecurityTrails', 'https://securitytrails.com/domain/{v}/dns'], ['Wayback Machine', 'https://web.archive.org/web/*/{v}'], ['AlienVault OTX', 'https://otx.alienvault.com/indicator/domain/{v}']],
  email: [['Have I Been Pwned', 'https://haveibeenpwned.com/account/{e}'], ['Hunter verifier', 'https://hunter.io/email-verifier/{e}']],
  username: [['WhatsMyName', 'https://whatsmyname.app/?q={e}'], ['GitHub', 'https://github.com/{e}'], ['Reddit', 'https://www.reddit.com/user/{e}'], ['Keybase', 'https://keybase.io/{e}']],
  hash: [['VirusTotal', 'https://www.virustotal.com/gui/file/{v}'], ['Hybrid Analysis', 'https://www.hybrid-analysis.com/search?query={v}'],
    ['MalwareBazaar', 'https://bazaar.abuse.ch/browse.php?search=sha256%3A{v}']],
  url: [['VirusTotal', 'https://www.virustotal.com/gui/search/{e}'], ['urlscan.io', 'https://urlscan.io/search/#{e}'], ['Wayback Machine', 'https://web.archive.org/web/*/{v}']],
};
const links = (type, v) => (LINKS[type] || []).map(([name, t]) => ({ name, url: t.replace('{v}', v).replace('{e}', encodeURIComponent(v)) }));

// ---------- detection ----------
const v4 = (s) => { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s); return m && m.slice(1).every((x) => +x <= 255) ? m.slice(1).map(Number) : null; };
function privateV4(o) {
  return o[0] === 10 || o[0] === 127 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168) ||
    (o[0] === 169 && o[1] === 254) || (o[0] === 100 && o[1] >= 64 && o[1] <= 127) || o[0] === 0 || o[0] >= 224;
}
function detect(raw) {
  const v = String(raw || '').trim();
  if (!v || v.length > 300) return { type: null, value: v };
  if (/^https?:\/\//i.test(v)) {
    let host = ''; try { host = new URL(v).hostname.replace(/^\[|\]$/g, ''); } catch { return { type: null, value: v }; }
    const inner = detect(host);
    return { type: 'url', value: v, host, hostType: inner.type, internal: !!inner.internal };
  }
  const o = v4(v);
  if (o) return { type: 'ip', value: v, internal: privateV4(o), v4: o };
  if (/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(v)) return { type: 'mac', value: v.toLowerCase().replace(/-/g, ':'), internal: true };
  if (/^[0-9a-f]{32}$|^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(v)) return { type: 'hash', value: v.toLowerCase() };
  if (v.includes(':') && /^[0-9a-f:.]+$/i.test(v) && (v.match(/:/g) || []).length >= 2) {
    const lo = v.toLowerCase();
    return { type: 'ip', value: lo, internal: /^(fc|fd|fe8|fe9|fea|feb)/.test(lo) || lo === '::1' };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    const domain = v.split('@')[1].toLowerCase();
    return { type: 'email', value: v.toLowerCase(), domain, internal: /\.(internal|local|lan|home\.arpa|localdomain)$/.test(domain) };
  }
  if (/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(v)) {
    const d = v.toLowerCase();
    return { type: 'domain', value: d, internal: /\.(internal|local|lan|home\.arpa|localdomain)$/.test(d) };
  }
  if (/^[\d.:]+$/.test(v)) return { type: null, value: v };
  if (/^@?[a-z0-9._-]{2,40}$/i.test(v)) return { type: 'username', value: v.replace(/^@/, '') };
  return { type: null, value: v };
}

// ---------- helpers ----------
const why = (e) => (e.name === 'TimeoutError' || e.name === 'AbortError' ? 'timed out' : typeof e.code === 'string' ? e.code : e.message);
const settle = (p) => p.then((value) => ({ value }), (e) => ({ error: why(e) }));
async function getJson(url, { maxBytes = 2e6, ms = 10000 } = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), redirect: 'follow', headers: { Accept: 'application/rdap+json, application/json', 'User-Agent': 'prxy-core-recon' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader(); const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { reader.cancel(); throw new Error('response too large'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const fqdn = (d) => (d.endsWith('.') ? d : d + '.'); // trailing dot: never let the Tailscale search suffix rewrite the name
const vcardName = (ent) => { const fn = (ent.vcardArray?.[1] || []).find((x) => x[0] === 'fn'); return fn ? fn[3] : null; };
function rdapEntities(entities = [], role) {
  const out = [];
  const walk = (list) => list.forEach((e) => { if (!role || (e.roles || []).includes(role)) { const n = vcardName(e); if (n) out.push(n); } if (e.entities) walk(e.entities); });
  walk(entities);
  return [...new Set(out)];
}
const event = (r, action) => (r.events || []).find((e) => e.eventAction === action)?.eventDate || null;

// ---------- lab data ----------
function inSubnet(ip, cidr) {
  const [base, bits] = cidr.split('/'); const a = v4(ip); const b = v4(base);
  if (!a || !b) return false;
  const n = (o) => ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
  const mask = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (n(a) & mask) === (n(b) & mask);
}
function firewall(ip) {
  const since = Math.floor(Date.now() / 1000) - 86400;
  const asSrc = db.prepare('SELECT COUNT(*) AS n FROM fw_blocks WHERE ts >= ? AND src = ?').get(since, ip).n;
  const asDst = db.prepare('SELECT COUNT(*) AS n FROM fw_blocks WHERE ts >= ? AND dst = ?').get(since, ip).n;
  if (!asSrc && !asDst) return { blocks: 0 };
  const q = (sql) => db.prepare(sql).all(since, ip, ip);
  return {
    blocks: asSrc + asDst, asSource: asSrc, asTarget: asDst,
    ports: q('SELECT proto, dport, COUNT(*) AS n FROM fw_blocks WHERE ts >= ? AND (src = ? OR dst = ?) AND dport IS NOT NULL GROUP BY proto, dport ORDER BY n DESC LIMIT 8'),
    interfaces: q('SELECT iface, COUNT(*) AS n FROM fw_blocks WHERE ts >= ? AND (src = ? OR dst = ?) GROUP BY iface ORDER BY n DESC'),
    rules: q('SELECT label, COUNT(*) AS n FROM fw_blocks WHERE ts >= ? AND (src = ? OR dst = ?) GROUP BY label ORDER BY n DESC LIMIT 5'),
    first: db.prepare('SELECT MIN(ts) AS t FROM fw_blocks WHERE ts >= ? AND (src = ? OR dst = ?)').get(since, ip, ip).t,
    last: db.prepare('SELECT MAX(ts) AS t FROM fw_blocks WHERE ts >= ? AND (src = ? OR dst = ?)').get(since, ip, ip).t,
    recent: db.prepare('SELECT ts, iface, src, dst, dport, proto, label FROM fw_blocks WHERE ts >= ? AND (src = ? OR dst = ?) ORDER BY ts DESC LIMIT 10').all(since, ip, ip),
  };
}
function labFacts(ip) {
  const vlan = network.vlans.find((x) => inSubnet(ip, x.subnet));
  const guest = Object.entries(GUESTS).find(([, g]) => g.ip === ip);
  const device = db.prepare('SELECT name, kind, ssid, network, ap, known, first_seen, last_seen FROM devices WHERE ip = ? ORDER BY last_seen DESC LIMIT 1').get(ip);
  return {
    vlan: vlan ? `${vlan.name} (VLAN ${vlan.id}, ${vlan.subnet})` : null,
    guest: guest ? { vmid: Number(guest[0]), name: guest[1].name, role: guest[1].role } : null,
    device: device || null,
    firewall: firewall(ip),
  };
}

// ---------- public records ----------
async function ipPublic(d) {
  const tasks = { rdns: settle(dns.reverse(d.value)), rdap: settle(getJson(`https://rdap.org/ip/${encodeURIComponent(d.value)}`)) };
  if (d.v4) tasks.asn = settle(resolver.resolveTxt(fqdn(`${[...d.v4].reverse().join('.')}.origin.asn.cymru.com`)));
  const r = Object.fromEntries(await Promise.all(Object.entries(tasks).map(async ([k, p]) => [k, await p])));
  const out = { reverseDns: r.rdns.value || [], errors: {} };
  if (r.asn?.value?.length) {
    const [asn, prefix, cc] = r.asn.value[0].join('').split('|').map((s) => s.trim());
    out.asn = { asn: Number(asn.split(' ')[0]), prefix, country: cc };
    const name = await settle(resolver.resolveTxt(fqdn(`AS${out.asn.asn}.asn.cymru.com`)));
    if (name.value?.length) out.asn.name = name.value[0].join('').split('|').pop().trim();
  } else if (r.asn?.error) out.errors.asn = r.asn.error;
  if (r.rdap.value) {
    const x = r.rdap.value;
    out.registration = { network: x.name || null, handle: x.handle || null, range: x.startAddress ? `${x.startAddress} - ${x.endAddress}` : null,
      country: x.country || null, organisation: rdapEntities(x.entities, 'registrant')[0] || rdapEntities(x.entities)[0] || null, registered: event(x, 'registration') };
  } else out.errors.rdap = r.rdap.error;
  if (r.rdns.error && r.rdns.error !== 'ENOTFOUND') out.errors.reverseDns = r.rdns.error;
  return out;
}
async function domainDns(domain) {
  const types = { A: 'resolve4', AAAA: 'resolve6', MX: 'resolveMx', NS: 'resolveNs', TXT: 'resolveTxt', CAA: 'resolveCaa' };
  const res = await Promise.all(Object.entries(types).map(async ([t, fn]) => [t, await settle(resolver[fn](fqdn(domain)))]));
  const dmarc = await settle(resolver.resolveTxt(fqdn(`_dmarc.${domain}`)));
  const records = {};
  for (const [t, r] of res) {
    if (!r.value) continue;
    if (t === 'MX') records.MX = r.value.sort((a, b) => a.priority - b.priority).map((m) => `${m.priority} ${m.exchange}`);
    else if (t === 'TXT') records.TXT = r.value.map((x) => x.join(''));
    else if (t === 'CAA') records.CAA = r.value.map((x) => `${x.critical} ${Object.keys(x).find((k) => k !== 'critical')} ${Object.values(x).find((v, i) => i > 0) ?? ''}`.trim());
    else records[t] = r.value;
  }
  const spf = (records.TXT || []).find((x) => /^v=spf1/i.test(x)) || null;
  const dm = dmarc.value ? dmarc.value.map((x) => x.join('')).find((x) => /^v=DMARC1/i.test(x)) || null : null;
  return { records, mail: { spf, dmarc: dm, hasMx: !!(records.MX && records.MX.length) } };
}
async function domainPublic(domain, { allNames = false } = {}) {
  const [dnsInfo, rdap, crt] = await Promise.all([
    domainDns(domain),
    settle(getJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`)),
    settle(getJson(`https://crt.sh/?q=${encodeURIComponent('%.' + domain)}&output=json&exclude=expired&deduplicate=Y`, { maxBytes: 8e6, ms: 15000 })),
  ]);
  const out = { dns: dnsInfo.records, mail: dnsInfo.mail, errors: {} };
  if (rdap.value) {
    const x = rdap.value;
    out.registration = { registrar: rdapEntities(x.entities, 'registrar')[0] || null, registered: event(x, 'registration'),
      expires: event(x, 'expiration'), changed: event(x, 'last changed'), status: x.status || [],
      nameservers: (x.nameservers || []).map((n) => (n.ldhName || '').toLowerCase()).filter(Boolean) };
  } else out.errors.rdap = rdap.error;
  if (crt.value) {
    const names = new Set();
    let newest = null;
    for (const c of crt.value) {
      String(c.name_value || '').split('\n').forEach((n) => { const s = n.trim().toLowerCase(); if (s.endsWith(domain)) names.add(s); });
      if (!newest || c.not_before > newest) newest = c.not_before;
    }
    const sorted = [...names].sort();
    out.certificates = { valid: crt.value.length, newestIssued: newest, names: sorted.slice(0, 60), totalNames: names.size, ...(allNames ? { allNames: sorted } : {}) };
  } else out.errors.certificates = crt.error;
  return out;
}

// The lab's own public (egress) address. Behind Starlink's carrier NAT it changes now and then, so it is re-checked
// hourly. Lookups of it are labelled so the page never suggests blocking yourself.
let ownIp = { at: 0, ip: null };
async function ownPublicIp() {
  if (Date.now() - ownIp.at < 3600 * 1000) return ownIp.ip;
  try {
    const res = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(5000) });
    const ip = (await res.text()).trim();
    ownIp = { at: Date.now(), ip: v4(ip) || ip.includes(':') ? ip : null };
  } catch { ownIp = { at: Date.now() - 3300 * 1000, ip: ownIp.ip }; } // retry in ~5 minutes, keep the last known one
  return ownIp.ip;
}

// ---------- main ----------
async function lookup(raw) {
  const d = detect(raw);
  if (!d.type) return { query: d.value, type: null };
  const key = `${d.type}:${d.value}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.result, cached: true };

  const result = { query: d.value, type: d.type, internal: !!d.internal, local: null, public: null, links: [], sources: [] };
  if (d.type === 'ip') {
    if (!d.internal && d.value === await ownPublicIp()) result.ownPublic = true;
    result.local = labFacts(d.value); result.sources.push('Prxy Core firewall history (24 h), VLAN map, devices');
    if (!d.internal) { result.public = await ipPublic(d); result.sources.push('reverse DNS', 'Team Cymru (ASN)', 'RDAP (rdap.org)'); result.links = links('ip', d.value); }
  } else if (d.type === 'domain' && !d.internal) {
    result.public = await domainPublic(d.value); result.sources.push('DNS (1.1.1.1)', 'RDAP (rdap.org)', 'certificate logs (crt.sh)');
    result.links = links('domain', d.value);
  } else if (d.type === 'email') {
    if (!d.internal) { const x = await domainDns(d.domain); result.public = { domain: d.domain, dns: { MX: x.records.MX || [] }, mail: x.mail }; result.sources.push('DNS (1.1.1.1)'); }
    result.links = links('email', d.value).concat(links('domain', d.domain).slice(0, 1));
  } else if (d.type === 'url') {
    result.host = d.host;
    if (d.hostType === 'ip') { const sub = { type: 'ip', value: d.host, internal: d.internal, v4: v4(d.host) }; result.local = labFacts(d.host); if (!d.internal) result.public = await ipPublic(sub); }
    else if (d.hostType === 'domain' && !d.internal) result.public = await domainPublic(d.host);
    if (!d.internal) result.links = links('url', d.value).concat(links(d.hostType === 'ip' ? 'ip' : 'domain', d.host).slice(0, 3));
    result.sources.push('host part looked up as ' + d.hostType);
  } else if (d.type === 'mac') {
    result.local = { device: db.prepare('SELECT name, kind, ip, ssid, network, ap, known, first_seen, last_seen FROM devices WHERE lower(key) = ?').get(d.value) || null };
    result.sources.push('Prxy Core devices');
  } else {
    result.links = links(d.type, d.value);
  }
  cache.set(key, { at: Date.now(), result });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return result;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of cache) if (now - v.at > CACHE_MS) cache.delete(k); }, 60000).unref();

// ---------- plain-English summary (idea 7) ----------
// The local Ollama model (LXC 131, RTX 3060) explains a lookup. Only the facts already shown on the page are sent, and
// only to the lab's own GPU - never to an outside AI. Nothing is stored.
const OLLAMA = process.env.OLLAMA_URL || 'http://10.20.40.131:11434';
const MODEL = process.env.RECON_MODEL || 'phi4';
function factsFor(r) {
  const f = JSON.parse(JSON.stringify({ query: r.query, type: r.type, internal: r.internal, isTheOwnersOwnPublicInternetAddress: !!r.ownPublic, local: r.local, public: r.public }));
  if (f.local && f.local.firewall && f.local.firewall.recent) f.local.firewall.recent = f.local.firewall.recent.slice(0, 5);
  if (f.public && f.public.certificates) { f.public.certificates.names = (f.public.certificates.names || []).slice(0, 15); delete f.public.certificates.allNames; }
  return f;
}
async function summarize(r) {
  const prompt = 'You help a home-lab owner understand an internet address, domain or account. Using ONLY the facts below, write 3 to 5 short '
    + 'plain-English sentences: what it is, what it has been doing to their network (if anything), and whether they should do anything. '
    + 'Do not invent facts; if something is unknown, say so. No headings or lists.\n\nFacts (JSON):\n' + JSON.stringify(factsFor(r));
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ model: MODEL, prompt, stream: false, options: { temperature: 0.2, num_predict: 260 } }),
  });
  if (!res.ok) throw Object.assign(new Error(`Local AI (Ollama) answered HTTP ${res.status}`), { status: 502 });
  const j = await res.json();
  return { text: String(j.response || '').trim(), model: MODEL, seconds: Math.round((j.total_duration || 0) / 1e9) };
}

module.exports = { lookup, detect, domainPublic, summarize };
