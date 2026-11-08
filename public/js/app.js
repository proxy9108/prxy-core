// Prxy Core frontend. Everything is built with DOM nodes - no innerHTML -
// so database contents can never be interpreted as markup.
'use strict';

// ---------- helpers ----------
const SVGNS = 'http://www.w3.org/2000/svg';
const ICONS = {
  logo: ['M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3-3.6-3-8-3-8 1.3-8 3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  db: ['M5 5.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5S15.9 3 12 3 5 4.1 5 5.5z', 'M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13', 'M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5'],
  bolt: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  net: ['M12 3v5', 'M5 21v-5h14v5z', 'M12 8H5v5', 'M12 8h7v5', 'M3 13h4v3H3z', 'M17 13h4v3h-4z', 'M10 13h4v3h-4z'],
  shield: ['M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z', 'M9 12l2 2 4-4'],
  home: ['M3 11l9-8 9 8', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6'],
  server: ['M3 4h18v6H3z', 'M3 14h18v6H3z', 'M7 7h.01', 'M7 17h.01'],
  box: ['M12 2l9 5v10l-9 5-9-5V7z', 'M3 7l9 5 9-5', 'M12 12v10'],
  bell: ['M6 16V11a6 6 0 0 1 12 0v5l2 2H4z', 'M10 20a2 2 0 0 0 4 0'],
  file: ['M6 2h9l5 5v15H6z', 'M14 2v6h6', 'M9 13h7', 'M9 17h7'],
  grid: ['M3 3h18v18H3z', 'M3 9h18', 'M3 15h18', 'M9 3v18'],
  terminal: ['M4 17l6-5-6-5', 'M12 19h8'],
  pulse: ['M3 12h4l3-8 4 16 3-8h4'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  play: ['M6 4l14 8-14 8z'],
  save: ['M5 3h11l3 3v15H5z', 'M8 3v5h8V3', 'M8 14h8v7H8z'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M5 20h14'],
  out: ['M15 4h4v16h-4', 'M10 16l-4-4 4-4', 'M6 12h11'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  left: ['M15 18l-6-6 6-6'],
  right: ['M9 6l6 6-6 6'],
  check: ['M5 12l5 5 9-10'],
  alert: ['M12 3l10 18H2z', 'M12 10v5', 'M12 18h.01'],
  book: ['M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z', 'M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'M2 12h2', 'M20 12h2', 'M5 5l1.5 1.5', 'M17.5 17.5L19 19', 'M5 19l1.5-1.5', 'M17.5 6.5L19 5'],
};
function icon(name) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'icon');
  s.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] || []) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    s.appendChild(p);
  }
  return s;
}

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    n.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return n;
}

const fmtBytes = (b) => {
  if (b == null) return '-';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let n = Number(b);
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
};
const fmtNum = (n) => (n == null ? '-' : Number(n).toLocaleString());
const fmtPct = (x) => (x == null ? '-' : `${(x * 100).toFixed(1)}%`);
const fmtAgo = (iso) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const enc = encodeURIComponent;
const pgVersion = (v) => (/PostgreSQL ([\d.]+)/.exec(v) || [])[1] || v;

function toast(msg) {
  const t = el('div', { class: 'toast', role: 'status', text: msg });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'X-Prxy': '1', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/login')) { state.user = null; route(); throw new Error('Signed out'); }
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.code });
  return data;
}

function cellValue(v) {
  if (v === null || v === undefined) return { text: 'NULL', cls: 'null' };
  if (typeof v === 'object') return { text: JSON.stringify(v), cls: 'mono' };
  if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.length < 20)) return { text: String(v), cls: 'num' };
  return { text: String(v), cls: '' };
}

function resultTable(fields, rows, masked = [], { sort, onSort, types } = {}) {
  if (!fields.length) return el('div', { class: 'empty', text: 'Statement returned no columns.' });
  const maskedSet = new Set(masked);
  return el('div', { class: 'table-wrap' },
    el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, fields.map((f) => {
        const arrow = sort && sort.col === f ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';
        return el('th', { class: onSort ? 'sortable' : '', title: onSort ? 'Sort' : null, onclick: onSort ? () => onSort(f) : null },
          f + arrow, maskedSet.has(f) ? ' ' : null, maskedSet.has(f) ? el('span', { class: 'badge warn', text: 'masked' }) : null,
          types && types[f] ? el('span', { class: 'type', text: types[f] }) : null);
      }))),
      el('tbody', {}, rows.length ? rows.map((r) => el('tr', {}, r.map((v, i) => {
        if (maskedSet.has(fields[i]) && v === '••••••') return el('td', { class: 'masked', text: v });
        const c = cellValue(v);
        return el('td', { class: c.cls, title: c.text.length > 60 ? c.text.slice(0, 2000) : null, text: c.text });
      }))) : el('tr', {}, el('td', { colspan: fields.length, class: 'empty', text: 'No rows.' })))));
}

function toCSV(fields, rows) {
  const q = (v) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [fields.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\r\n');
}
function download(name, text) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function sparkline(points) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('class', 'spark');
  s.setAttribute('viewBox', '0 0 100 30');
  s.setAttribute('preserveAspectRatio', 'none');
  if (points.length < 2) return s;
  const ys = points.map((p) => p[1]);
  const xs = points.map((p) => p[0]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y1 === y0) { y0 -= 1; y1 += 1; }
  const pt = (p) => `${((p[0] - x0) / (x1 - x0 || 1) * 100).toFixed(2)},${(28 - (p[1] - y0) / (y1 - y0) * 26).toFixed(2)}`;
  const line = 'M' + points.map(pt).join(' L');
  const area = document.createElementNS(SVGNS, 'path');
  area.setAttribute('class', 'area');
  area.setAttribute('d', `${line} L100,30 L0,30 Z`);
  const l = document.createElementNS(SVGNS, 'path');
  l.setAttribute('class', 'line');
  l.setAttribute('d', line);
  l.setAttribute('vector-effect', 'non-scaling-stroke');
  s.append(area, l);
  return s;
}

// ---------- app shell ----------
const state = { user: null, setup: false };
const root = () => document.getElementById('app');

function themeToggle() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const b = el('button', { class: 'btn secondary small theme-toggle', title: dark ? 'Switch to light mode' : 'Switch to dark mode', 'aria-label': 'Toggle dark mode' }, icon(dark ? 'sun' : 'moon'));
  b.addEventListener('click', () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('prxy.theme', next); } catch { /* storage blocked */ }
    route();
  });
  return b;
}

function shell(active, content) {
  const link = (href, name, ic) => el('a', { href, class: active === name ? 'active' : '' }, icon(ic), name);
  return [
    el('nav', { class: 'nav' }, el('div', { class: 'nav-inner' },
      el('a', { href: '#/', class: 'brand' }, el('span', { class: 'brand-mark' }, icon('logo')), el('span', { class: 'brand-name' }, 'Prxy ', el('span', { text: 'Core' }))),
      el('div', { class: 'nav-links' },
        link('#/', 'Overview', 'home'),
        link('#/infra', 'Infrastructure', 'server'),
        link('#/network', 'Network', 'net'),
        link('#/docker', 'Docker', 'box'),
        link('#/backups', 'Backups', 'save'),
        link('#/power', 'Power', 'bolt'),
        link('#/databases', 'Databases', 'db'),
        link('#/query', 'Query', 'terminal'),
        link('#/security', 'Security', 'shield'),
        link('#/recon', 'Recon', 'eye'),
        link('#/dashboards', 'Dashboards', 'pulse'),
        link('#/monitoring', 'Monitoring', 'bell'),
        link('#/logs', 'Logs', 'file'),
        link('#/audit', 'Audit', 'list'),
        link('#/guide', 'Guide', 'book')),
      el('div', { class: 'nav-user' },
        themeToggle(),
        el('span', { text: state.user.username }),
        el('button', { class: 'btn secondary small', onclick: logout }, icon('out'), 'Sign out')))),
    el('main', { class: 'main' }, content),
  ];
}

function render(nodes) {
  fill(root(), nodes);
}
// replaceChildren that skips null/false, so optional sections can be written inline.
function fill(node, ...kids) {
  node.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}
// Any view that renders asynchronously calls this via the observer below, so
// meters/charts get their CSSOM sizes no matter when they appear.
new MutationObserver(() => applyMeters(document.getElementById('app'))).observe(document.documentElement, { childList: true, subtree: true });

async function logout() {
  await api('/logout', { method: 'POST' }).catch(() => {});
  state.user = null;
  location.hash = '#/';
  route();
}

function errorBox(e) {
  return el('div', { class: 'alert error' }, icon('alert'), el('pre', { text: e.message + (e.code ? `  [${e.code}]` : '') }));
}

// ---------- auth screens ----------
function authCard(subtitle, ...body) {
  return el('div', { class: 'auth-wrap' }, el('div', { class: 'card auth-card' },
    el('div', { class: 'brand' }, el('span', { class: 'brand-mark' }, icon('logo')), el('span', { class: 'brand-name' }, 'Prxy ', el('span', { text: 'Core' }))),
    el('p', { class: 'sub', text: subtitle }), ...body));
}

function viewLogin() {
  const msg = el('div');
  const u = el('input', { class: 'field', autocomplete: 'username', required: true, id: 'u' });
  const p = el('input', { class: 'field', type: 'password', autocomplete: 'current-password', required: true, id: 'p' });
  const c = el('input', { class: 'field mono', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, required: true, id: 'c' });
  const form = el('form', { onsubmit: async (ev) => {
    ev.preventDefault();
    fill(msg);
    try {
      await api('/login', { method: 'POST', body: { username: u.value, password: p.value, code: c.value } });
      await boot();
    } catch (e) { fill(msg, errorBox(e)); c.value = ''; }
  } }, msg,
    el('label', { for: 'u', text: 'Username' }), u,
    el('label', { for: 'p', text: 'Password' }), p,
    el('label', { for: 'c', text: 'Authenticator code' }), c,
    el('button', { class: 'btn', type: 'submit' }, 'Sign in'));
  render(authCard('Homelab control center', form));
  u.focus();
}

function viewSetup() {
  const msg = el('div');
  const tok = el('input', { class: 'field mono', id: 't', required: true, autocomplete: 'off' });
  const step1 = el('form', { onsubmit: async (ev) => {
    ev.preventDefault();
    fill(msg);
    try {
      const r = await api('/setup/start', { method: 'POST', body: { token: tok.value.trim() } });
      step2(tok.value.trim(), r);
    } catch (e) { fill(msg, errorBox(e)); }
  } }, msg,
    el('div', { class: 'alert info', text: 'First run. Enter the setup token printed in the service log (journalctl -u prxy-core).' }),
    el('label', { for: 't', text: 'Setup token' }), tok,
    el('button', { class: 'btn', type: 'submit' }, 'Continue'));
  render(authCard('Create the admin account', step1));
  tok.focus();

  function step2(token, { qr, secret }) {
    const m = el('div');
    const u = el('input', { class: 'field', id: 'u', value: 'proxy', autocomplete: 'username', required: true });
    const p = el('input', { class: 'field', id: 'p', type: 'password', autocomplete: 'new-password', minlength: 12, required: true });
    const c = el('input', { class: 'field mono', id: 'c', inputmode: 'numeric', maxlength: 8, required: true, autocomplete: 'one-time-code' });
    const form = el('form', { onsubmit: async (ev) => {
      ev.preventDefault();
      fill(m);
      try {
        await api('/setup/finish', { method: 'POST', body: { token, username: u.value, password: p.value, code: c.value } });
        await boot();
      } catch (e) { fill(m, errorBox(e)); }
    } }, m,
      el('p', { class: 'sub', text: 'Scan with your authenticator app (2FA is required).' }),
      el('img', { class: 'qr', src: qr, width: 220, height: 220, alt: 'Authenticator QR code' }),
      el('p', { class: 'secret', text: secret }),
      el('label', { for: 'u', text: 'Username' }), u,
      el('label', { for: 'p', text: 'Password (12+ characters)' }), p,
      el('label', { for: 'c', text: 'Code from the app' }), c,
      el('button', { class: 'btn', type: 'submit' }, 'Create account'));
    render(authCard('Create the admin account', form));
    p.focus();
  }
}

// ---------- Databases overview ----------
async function viewDatabases() {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading databases…' }));
  render(shell('Databases', [
    el('div', { class: 'page-head' }, el('div', {}, el('h1', { text: 'Databases' }),
      el('p', { class: 'sub', text: 'PostgreSQL on 10.20.40.111 - read-only access as the viewer role' })),
      el('a', { class: 'btn secondary', href: '#/health' }, icon('pulse'), 'Server health')),
    body]));
  try {
    const [{ databases }, h] = await Promise.all([api('/databases'), api('/health')]);
    const total = databases.reduce((a, d) => a + d.bytes, 0);
    const up = h.server.started ? fmtAgo(h.server.started).replace(' ago', '') : '-';
    fill(body, 
      el('div', { class: 'grid grid-stats' },
        stat('PostgreSQL', pgVersion(h.server.version), `up ${up}`),
        stat('Connections', `${h.server.connections} / ${h.server.max_connections}`, 'client + background'),
        stat('Total size', fmtBytes(total), `${databases.length} databases`),
        stat('Latency', `${h.ping_ms} ms`, 'round trip from Prxy Core'),
        stat('Waiting locks', String(h.waiting_locks), h.waiting_locks ? 'something is blocked' : 'none')),
      el('div', { class: 'grid grid-dbs' }, databases.map(dbCard)));
  } catch (e) { fill(body, errorBox(e)); }
}

function guideBanner() {
  let dismissed = false;
  try { dismissed = localStorage.getItem('prxy.guideSeen') === '1'; } catch { /* ignore */ }
  if (dismissed) return null;
  const box = el('div', { class: 'alert warn banner' }, icon('book'),
    el('span', { class: 'grow' }, 'New to Prxy Core? ', el('a', { href: '#/guide', class: 'link-strong', text: 'Take the 10-minute guided tour' }), ' to learn what each page does.'),
    el('button', { class: 'icon-btn', 'aria-label': 'Dismiss', title: 'Dismiss', onclick: () => {
      try { localStorage.setItem('prxy.guideSeen', '1'); } catch { /* ignore */ }
      box.remove();
    } }, icon('close')));
  return box;
}

function stat(label, value, note) {
  return el('div', { class: 'card' }, el('div', { class: 'stat-label', text: label }),
    el('div', { class: String(value).length > 11 ? 'stat-value long' : 'stat-value', text: value }), el('div', { class: 'stat-note', text: note }));
}

function dbCard(d) {
  const inner = [
    el('div', { class: 'db-card-head' },
      el('div', { class: 'db-name' }, icon(d.can_connect ? 'db' : 'lock'), d.name),
      d.can_connect ? el('span', { class: 'badge ok', text: 'readable' }) : el('span', { class: 'badge warn', text: 'no access' })),
    d.history.length > 1 ? sparkline(d.history) : el('div', { class: 'spark-empty', text: 'Size history builds hourly' }),
    el('div', { class: 'db-metrics' },
      el('div', {}, el('b', { text: fmtBytes(d.bytes) }), 'size'),
      el('div', {}, el('b', { text: String(d.connections) }), 'connections'),
      el('div', {}, el('b', { text: fmtPct(d.cache_hit) }), 'cache hit')),
  ];
  if (!d.can_connect) {
    inner.push(el('p', { class: 'stat-note mt10', text: 'This database revokes CONNECT from PUBLIC. Grant CONNECT to viewer to browse it.' }));
    return el('div', { class: 'card db-card locked' }, inner);
  }
  return el('a', { class: 'card db-card', href: `#/db/${enc(d.name)}` }, inner);
}

// ---------- Database: table list ----------
async function viewDatabase(name) {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading tables…' }));
  render(shell('Databases', [
    el('div', { class: 'page-head' }, el('div', {},
      el('div', { class: 'crumbs' }, el('a', { href: '#/databases', text: 'Databases' }), el('span', { text: '/' }), el('span', { text: name })),
      el('h1', { text: name })),
      el('a', { class: 'btn secondary', href: `#/query?db=${enc(name)}` }, icon('terminal'), 'Query this database')),
    body]));
  try {
    const { tables } = await api(`/databases/${enc(name)}/tables`);
    const filter = el('input', { class: 'grow', placeholder: 'Filter tables…', type: 'search' });
    const holder = el('div');
    const draw = () => {
      const f = filter.value.toLowerCase();
      const list = tables.filter((t) => !f || `${t.schema}.${t.name}`.toLowerCase().includes(f));
      fill(holder, el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ['Table', 'Kind', 'Rows (est.)', 'Size', 'Dead rows', 'Last autovacuum'].map((x, i) => el('th', { class: i >= 2 && i <= 4 ? 'num' : '', text: x })))),
        el('tbody', {}, list.length ? list.map((t) => el('tr', { class: 'clickable', onclick: () => { location.hash = `#/db/${enc(name)}/t/${enc(t.schema)}/${enc(t.name)}`; } },
          el('td', {}, t.schema !== 'public' ? el('span', { class: 'sub', text: t.schema + '.' }) : null, el('b', { text: t.name })),
          el('td', {}, el('span', { class: 'badge', text: t.kind })),
          el('td', { class: 'num', text: fmtNum(t.est_rows) }),
          el('td', { class: 'num', text: fmtBytes(t.bytes) }),
          el('td', { class: 'num', text: fmtNum(t.dead_rows) }),
          el('td', { text: t.kind === 'table' ? fmtAgo(t.last_autovacuum) : '-' }))) :
          el('tr', {}, el('td', { colspan: 6, class: 'empty', text: 'No tables match.' }))))));
    };
    filter.addEventListener('input', draw);
    const totalBytes = tables.reduce((a, t) => a + t.bytes, 0);
    fill(body, el('div', { class: 'toolbar' }, filter,
      el('span', { class: 'sub', text: `${tables.length} relations · ${fmtBytes(totalBytes)}` })), holder);
    draw();
    filter.focus();
  } catch (e) { fill(body, errorBox(e)); }
}

// ---------- Table: data + structure ----------
async function viewTable(dbName, schema, table) {
  const base = `/databases/${enc(dbName)}/tables/${enc(schema)}/${enc(table)}`;
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading…' }));
  const tabs = el('div', { class: 'tabs' });
  render(shell('Databases', [
    el('div', { class: 'page-head' }, el('div', {},
      el('div', { class: 'crumbs' }, el('a', { href: '#/databases', text: 'Databases' }), el('span', { text: '/' }), el('a', { href: `#/db/${enc(dbName)}`, text: dbName }), el('span', { text: '/' }), el('span', { text: schema })),
      el('h1', { text: table }))),
    tabs, body]));

  let meta;
  try { meta = await api(base); } catch (e) { fill(body, errorBox(e)); return; }
  const types = Object.fromEntries(meta.columns.map((c) => [c.name, c.type]));
  const pk = meta.columns.find((c) => c.pk);
  const st = { offset: 0, limit: 100, sort: pk ? { col: pk.name, dir: 'asc' } : null, unmask: false };

  const showData = async () => {
    fill(body, el('div', { class: 'spinner', text: 'Loading rows…' }));
    try {
      const qs = new URLSearchParams({ limit: st.limit, offset: st.offset });
      if (st.sort) { qs.set('orderBy', st.sort.col); qs.set('dir', st.sort.dir); }
      if (st.unmask) qs.set('unmask', '1');
      const r = await api(`${base}/rows?${qs}`);
      const hasSensitive = meta.columns.some((c) => c.sensitive);
      fill(body, 
        el('div', { class: 'toolbar' },
          el('button', { class: 'btn secondary small', disabled: st.offset === 0, onclick: () => { st.offset = Math.max(0, st.offset - st.limit); showData(); } }, icon('left'), 'Prev'),
          el('span', { class: 'sub', text: r.rows.length ? `Rows ${fmtNum(st.offset + 1)}-${fmtNum(st.offset + r.rows.length)}` : 'No rows' }),
          el('button', { class: 'btn secondary small', disabled: r.rows.length < st.limit, onclick: () => { st.offset += st.limit; showData(); } }, 'Next', icon('right')),
          el('span', { class: 'grow' }),
          hasSensitive ? el('button', { class: 'btn secondary small', onclick: () => {
            if (!st.unmask && !confirm('Show sensitive columns (passwords, tokens, hashes) in clear text? This is recorded in the audit log.')) return;
            st.unmask = !st.unmask; showData();
          } }, icon(st.unmask ? 'lock' : 'eye'), st.unmask ? 'Mask sensitive' : 'Reveal sensitive') : null,
          el('button', { class: 'btn secondary small', onclick: () => download(`${dbName}-${table}.csv`, toCSV(r.fields, r.rows)) }, icon('download'), 'CSV')),
        resultTable(r.fields, r.rows, r.masked, { types, sort: st.sort, onSort: (col) => {
          st.sort = st.sort && st.sort.col === col ? { col, dir: st.sort.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' };
          st.offset = 0; showData();
        } }));
    } catch (e) { fill(body, errorBox(e)); }
  };

  const showStructure = () => {
    const mk = (fields, rows) => resultTable(fields, rows);
    fill(body, 
      el('h3', { class: 'section-title', text: 'Columns' }),
      mk(['name', 'type', 'nullable', 'default', 'key', 'sensitive'], meta.columns.map((c) => [c.name, c.type, c.not_null ? 'no' : 'yes', c.default, c.pk ? 'PK' : '', c.sensitive ? 'masked' : ''])),
      el('h3', { class: 'section-title', text: 'Indexes' }),
      mk(['name', 'definition', 'size', 'scans'], meta.indexes.map((i) => [i.name, i.definition, fmtBytes(i.bytes), i.scans])),
      el('h3', { class: 'section-title', text: 'Foreign keys' }),
      mk(['name', 'definition'], meta.foreign_keys.map((f) => [f.name, f.definition])));
  };

  const setTab = (t) => {
    fill(tabs, 
      el('button', { class: t === 'data' ? 'active' : '', onclick: () => setTab('data') }, 'Data'),
      el('button', { class: t === 'structure' ? 'active' : '', onclick: () => setTab('structure') }, 'Structure'));
    if (t === 'data') showData(); else showStructure();
  };
  setTab('data');
}

// ---------- Query console ----------
async function viewQuery(params) {
  const dbSel = el('select', { 'aria-label': 'Database' });
  const editor = el('textarea', { class: 'editor', spellcheck: 'false', placeholder: 'SELECT * FROM ... (read-only, one statement, max 500 rows)' });
  const unmask = el('input', { type: 'checkbox' });
  const result = el('div');
  const saved = el('ul', { class: 'saved-list' });
  const runBtn = el('button', { class: 'btn', onclick: () => run() }, icon('play'), 'Run');

  try { editor.value = sessionStorage.getItem('prxy.sql') || ''; } catch { /* storage unavailable */ }
  editor.addEventListener('input', () => { try { sessionStorage.setItem('prxy.sql', editor.value); } catch { /* ignore */ } });
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    if (e.key === 'Tab') { e.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); }
  });

  render(shell('Query', [
    el('div', { class: 'page-head' }, el('div', {}, el('h1', { text: 'Query console' }),
      el('p', { class: 'sub', text: 'Runs inside a READ ONLY transaction as the viewer role. 15 s timeout. Every query is audited.' }))),
    el('div', { class: 'console' },
      el('div', {},
        el('div', { class: 'toolbar' }, dbSel, el('span', { class: 'grow' }),
          el('label', { class: 'check' }, unmask, 'Reveal sensitive columns'),
          el('button', { class: 'btn secondary', onclick: saveQuery }, icon('save'), 'Save'), runBtn),
        editor,
        el('p', { class: 'sub hint', text: 'Ctrl+Enter to run' }),
        result),
      el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'Saved queries' }), saved)),
  ]));

  try {
    const { databases } = await api('/databases');
    fill(dbSel, ...databases.filter((d) => d.can_connect).map((d) => el('option', { value: d.name, text: d.name })));
    const want = params.get('db') || (() => { try { return sessionStorage.getItem('prxy.db'); } catch { return null; } })();
    if (want && databases.some((d) => d.name === want && d.can_connect)) dbSel.value = want;
    dbSel.addEventListener('change', () => { try { sessionStorage.setItem('prxy.db', dbSel.value); } catch { /* ignore */ } });
  } catch (e) { fill(result, errorBox(e)); }
  loadSaved();
  editor.focus();

  async function run() {
    if (!editor.value.trim()) return;
    runBtn.disabled = true;
    fill(result, el('div', { class: 'spinner', text: 'Running…' }));
    try {
      const r = await api(`/databases/${enc(dbSel.value)}/query`, { method: 'POST', body: { sql: editor.value, unmask: unmask.checked } });
      fill(result, 
        el('div', { class: 'result-meta' },
          el('span', { class: 'badge ok' }, icon('check'), 'ok'),
          el('span', { text: `${fmtNum(r.rows.length)} rows in ${r.ms} ms` }),
          r.truncated ? el('span', { class: 'badge warn', text: 'truncated at 500 rows' }) : null,
          el('span', { class: 'grow' }),
          r.fields.length ? el('button', { class: 'btn secondary small', onclick: () => download(`${dbSel.value}-query.csv`, toCSV(r.fields, r.rows)) }, icon('download'), 'CSV') : null),
        resultTable(r.fields, r.rows, r.masked));
    } catch (e) { fill(result, el('div', { class: 'mt14' }, errorBox(e))); }
    runBtn.disabled = false;
  }

  async function loadSaved() {
    try {
      const { queries } = await api('/saved-queries');
      fill(saved, ...(queries.length ? queries.map((q) => el('li', {},
        el('button', { class: 'link', title: q.sql, onclick: () => { editor.value = q.sql; if ([...dbSel.options].some((o) => o.value === q.database)) dbSel.value = q.database; editor.focus(); } },
          q.name, el('span', { class: 'db-tag', text: q.database })),
        el('button', { class: 'icon-btn', title: 'Delete', 'aria-label': `Delete ${q.name}`, onclick: async () => {
          if (!confirm(`Delete saved query "${q.name}"?`)) return;
          await api(`/saved-queries/${q.id}`, { method: 'DELETE' }); loadSaved();
        } }, icon('trash')))) : [el('li', { class: 'sub', text: 'Nothing saved yet.' })]));
    } catch (e) { fill(saved, el('li', { text: e.message })); }
  }

  async function saveQuery() {
    if (!editor.value.trim()) return;
    const name = prompt('Name this query');
    if (!name) return;
    try {
      await api('/saved-queries', { method: 'POST', body: { name, database: dbSel.value, sql: editor.value } });
      toast('Saved'); loadSaved();
    } catch (e) { toast(e.message); }
  }
}

// ---------- Health ----------
async function viewHealth() {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading…' }));
  render(shell('Databases', [
    el('div', { class: 'page-head' }, el('div', {}, el('h1', { text: 'Server health' }),
      el('p', { class: 'sub', text: 'Live activity on the Postgres server' })),
      el('button', { class: 'btn secondary', onclick: () => viewHealth() }, icon('refresh'), 'Refresh')),
    body]));
  try {
    const [h, { databases }] = await Promise.all([api('/health'), api('/databases')]);
    const pctConn = h.server.connections / h.server.max_connections;
    fill(body, 
      el('div', { class: 'grid grid-stats' },
        stat('PostgreSQL', pgVersion(h.server.version), `started ${new Date(h.server.started).toLocaleString()}`),
        stat('Connections', `${Math.round(pctConn * 100)}%`, `${h.server.connections} of ${h.server.max_connections}`),
        stat('Shared buffers', h.server.shared_buffers, `${fmtNum(h.server.checkpoints)} checkpoints`),
        stat('Long-running', String(h.long_running.length), 'queries over 5 s'),
        stat('Waiting locks', String(h.waiting_locks), h.waiting_locks ? 'investigate' : 'healthy')),
      el('h3', { class: 'section-title', text: 'Per database' }),
      resultTable(['database', 'size', 'connections', 'cache hit', 'commits', 'rollbacks', 'deadlocks'],
        databases.map((d) => [d.name, fmtBytes(d.bytes), d.connections, fmtPct(d.cache_hit), fmtNum(d.xact_commit), fmtNum(d.xact_rollback), d.deadlocks])),
      el('h3', { class: 'section-title', text: 'Who is connected' }),
      resultTable(['database', 'user', 'application', 'client', 'state', 'count'],
        h.activity.map((a) => [a.datname, a.usename, a.application_name, a.client_addr, a.state, a.n])),
      el('h3', { class: 'section-title', text: 'Long-running queries' }),
      h.long_running.length
        ? resultTable(['pid', 'database', 'user', 'state', 'running for', 'query'], h.long_running.map((q) => [q.pid, q.datname, q.usename, q.state, q.running_for, q.query]))
        : el('div', { class: 'alert info' }, icon('check'), 'Nothing running longer than 5 seconds.'));
  } catch (e) { fill(body, errorBox(e)); }
}

// ---------- Audit ----------
async function viewAudit() {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading…' }));
  render(shell('Audit', [
    el('div', { class: 'page-head' }, el('div', {}, el('h1', { text: 'Audit log' }),
      el('p', { class: 'sub', text: 'Sign-ins, queries and reveals of sensitive data' }))),
    body]));
  try {
    const { entries } = await api('/audit?limit=500');
    fill(body, el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, ['Time (UTC)', 'User', 'Action', 'Target', 'Detail', 'Rows', 'ms', 'Result', 'IP'].map((x) => el('th', { text: x })))),
      el('tbody', {}, entries.length ? entries.map((a) => el('tr', {},
        el('td', { class: 'mono', text: a.ts }),
        el('td', { text: a.username || '-' }),
        el('td', {}, el('span', { class: 'badge' + (a.action.includes('unmask') ? ' warn' : ''), text: a.action })),
        el('td', { class: 'mono', text: a.target || '' }),
        el('td', { class: 'mono', title: a.detail || null, text: a.detail ? a.detail.replace(/\s+/g, ' ').slice(0, 120) : '' }),
        el('td', { class: 'num', text: a.rows ?? '' }),
        el('td', { class: 'num', text: a.ms ?? '' }),
        el('td', {}, el('span', { class: 'badge ' + (a.ok ? 'ok' : 'bad'), text: a.ok ? 'ok' : 'failed' })),
        el('td', { class: 'mono', text: (a.ip || '').replace('::ffff:', '') }))) :
        el('tr', {}, el('td', { colspan: 9, class: 'empty', text: 'No entries yet.' }))))));
  } catch (e) { fill(body, errorBox(e)); }
}

// ---------- Phase 2 shared widgets ----------
const SERIES_COLORS = ['#d9720a', '#6b7a90', '#2f6f4e', '#3b6ea8', '#b3261e', '#8b93a0', '#7a4fa3', '#a3540a'];
const fmtRate = (b) => (b == null ? '-' : `${fmtBytes(b)}/s`);
const fmtDur = (s) => {
  if (s == null) return '-';
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
};
const LEVEL_LABEL = { red: 'Problem', amber: 'Warning', info: 'Info' };

function svgEl(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  return n;
}

// Multi-series line chart. series: [{name, values:[[ts, v]...]}]
// The SVG only draws grid + lines (it stretches to any width); axis labels are
// HTML so text never gets distorted.
function lineChart(series, { fmt = (v) => v.toFixed(1), height = 170, min0 = true, max = null } = {}) {
  const W = 600; const H = 100;
  const all = series.flatMap((s) => s.values);
  const wrap = el('div', { class: 'chart' });
  if (!all.length) { wrap.appendChild(el('div', { class: 'chart-empty', text: 'No data for this range' })); return wrap; }
  const xs = all.map((p) => p[0]); const ys = all.map((p) => p[1]).filter(Number.isFinite);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  let y0 = min0 ? 0 : Math.min(...ys); let y1 = Math.max(...ys);
  if (y1 === y0) y1 = y0 + 1;
  y1 = max != null ? max : y1 + (y1 - y0) * 0.08;
  const sx = (t) => ((t - x0) / (x1 - x0 || 1)) * W;
  const sy = (v) => (1 - (v - y0) / (y1 - y0)) * H;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', preserveAspectRatio: 'none', role: 'img' });
  const ticks = [3, 2, 1, 0].map((i) => y0 + ((y1 - y0) * i) / 3);
  ticks.forEach((v) => svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: sy(v), y2: sy(v), class: 'grid', 'vector-effect': 'non-scaling-stroke' })));
  series.forEach((s, i) => {
    const pts = s.values.filter((p) => Number.isFinite(p[1]));
    if (!pts.length) return;
    const d = 'M' + pts.map((p) => `${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(2)}`).join(' L');
    svg.appendChild(svgEl('path', { d, class: 'series', stroke: SERIES_COLORS[i % SERIES_COLORS.length], 'vector-effect': 'non-scaling-stroke' }));
  });
  const tfmt = (t) => {
    const d = new Date(t * 1000);
    const span = x1 - x0;
    if (span > 172800) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (span > 21600) return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const yAxis = el('div', { class: 'chart-y' }, ticks.map((v) => el('span', { text: fmt(v, y1 - y0) })));
  const plot = el('div', { class: 'chart-plot' }, svg);
  plot.dataset.h = String(height);
  wrap.append(el('div', { class: 'chart-body' }, yAxis, plot),
    el('div', { class: 'chart-x' }, el('span', { text: tfmt(x0) }), el('span', { text: tfmt(x1) })));
  if (series.length > 1) {
    wrap.appendChild(el('div', { class: 'legend' }, series.map((s, i) => {
      const last = s.values.length ? s.values[s.values.length - 1][1] : null;
      return el('span', {}, el('i', { class: `swatch c${i % SERIES_COLORS.length}` }), `${s.name}`, last != null ? el('b', { text: ` ${fmt(last, y1 - y0)}` }) : null);
    })));
  }
  return wrap;
}
// Percent formatter that adds decimals when the range is small (0.2% CPU shouldn't read as 0%).
const fmtPctAuto = (v, span = 100) => `${v.toFixed(span < 3 ? 2 : span < 30 ? 1 : 0)}%`;

function meter(fraction, { warn = 0.8, crit = 0.92 } = {}) {
  if (fraction == null) return el('span', { class: 'sub', text: '-' });
  const level = fraction >= crit ? 'crit' : fraction >= warn ? 'warn' : 'ok';
  const bar = el('span', { class: `meter-fill ${level}` });
  bar.dataset.w = String(Math.min(100, Math.round(fraction * 100)));
  return el('span', { class: 'meter' }, el('span', { class: 'meter-track' }, bar), el('span', { class: 'meter-text', text: `${Math.round(fraction * 100)}%` }));
}
// CSP forbids inline style attributes, so widths are applied through the CSSOM after render.
function applyMeters(root) {
  root.querySelectorAll('.meter-fill[data-w]').forEach((n) => { n.style.width = `${n.dataset.w}%`; });
  root.querySelectorAll('.chart-plot[data-h]').forEach((n) => { n.style.height = `${n.dataset.h}px`; });
}

const dot = (level, label) => el('span', { class: `dot ${level}`, title: label || null, 'aria-label': label || null });

function rangePicker(current, onPick) {
  return el('div', { class: 'seg', role: 'group', 'aria-label': 'Time range' }, ['1h', '6h', '24h', '7d'].map((r) =>
    el('button', { class: r === current ? 'active' : '', onclick: () => onPick(r) }, r)));
}

function extLink(url, label) {
  return el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'ext' }, label || 'Open');
}

function pageHead(title, sub, ...actions) {
  return el('div', { class: 'page-head' }, el('div', {}, el('h1', { text: title }), sub ? el('p', { class: 'sub', text: sub }) : null),
    actions.length ? el('div', { class: 'head-actions' }, actions) : null);
}

// Auto-refresh that stops as soon as the user navigates away.
let refreshTimer = null;
function autoRefresh(fn, ms) {
  clearInterval(refreshTimer);
  const hash = location.hash;
  refreshTimer = setInterval(() => { if (location.hash !== hash) clearInterval(refreshTimer); else fn(); }, ms);
}

// ---------- Overview (status board) ----------
async function viewHome() {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Checking the lab…' }));
  const stamp = el('span', { class: 'sub' });
  render(shell('Overview', [
    pageHead('Overview', 'Everything Prxy Core checks, worst first. Refreshes every minute.', stamp,
      el('button', { class: 'btn secondary', onclick: () => load() }, icon('refresh'), 'Refresh')),
    guideBanner(), body]));

  async function load() {
    try {
      const d = await api('/overview');
      const s = d.summary;
      const frac = (a, b) => (a == null ? '-' : `${a} / ${b}`);
      const headline = d.counts.red ? ['red', `${d.counts.red} problem${d.counts.red > 1 ? 's' : ''} need attention`]
        : d.counts.amber ? ['amber', `${d.counts.amber} warning${d.counts.amber > 1 ? 's' : ''}`] : ['green', 'All systems healthy'];
      fill(body, 
        el('div', { class: `headline ${headline[0]}` }, dot(headline[0]), headline[1]),
        el('div', { class: 'grid grid-stats' },
          stat('Guests running', s.guests ? frac(s.guests.running, s.guests.total) : '-', 'LXCs + VMs on Proxmox'),
          stat('Containers', s.containers ? frac(s.containers.running, s.containers.total) : '-', 'Docker on mgmt-docker'),
          stat('Web UIs up', s.services ? frac(s.services.up, s.services.total) : '-', 'HTTP probe every minute'),
          stat('Host CPU', s.host && s.host.cpuPct != null ? `${s.host.cpuPct.toFixed(1)}%` : '-', s.host ? `${s.host.cpus} cores · load ${s.host.load1}` : ''),
          stat('Host memory', s.host && s.host.memPct != null ? `${Math.round(s.host.memPct)}%` : '-', s.host ? `of ${fmtBytes(s.host.memSize)}` : '')),
        el('div', { class: 'checks' }, d.checks.length ? d.checks.map((c) => el(c.link ? 'a' : 'div', { class: `check-row ${c.level}`, href: c.link },
          dot(c.level, LEVEL_LABEL[c.level]),
          el('span', { class: 'check-area', text: c.area }),
          el('span', { class: 'check-main' }, el('b', { text: c.title }), c.detail ? el('span', { class: 'sub', text: c.detail }) : null),
          c.link ? icon('right') : null)) : el('div', { class: 'empty', text: 'No findings.' })));
      stamp.textContent = `Updated ${new Date(d.generatedAt).toLocaleTimeString()}`;
    } catch (e) { fill(body, errorBox(e)); }
  }
  await load();
  autoRefresh(load, 60000);
}

// ---------- Infrastructure ----------
async function viewInfra() {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading Proxmox…' }));
  render(shell('Infrastructure', [pageHead('Infrastructure', 'Proxmox host 10.20.40.224 - every LXC and VM, live from Prometheus'), body]));
  try {
    const d = await api('/infra');
    const h = d.host;
    const filter = el('input', { type: 'search', placeholder: 'Filter by name, role or VMID…', class: 'grow' });
    const holder = el('div');
    const draw = () => {
      const f = filter.value.toLowerCase();
      const list = d.guests.filter((g) => !f || `${g.vmid} ${g.name} ${g.role || ''}`.toLowerCase().includes(f));
      fill(holder, el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ['', 'VMID', 'Name', 'Role', 'CPU', 'Memory', 'Disk', 'Uptime', 'Backup', 'Web UI'].map((x) => el('th', { text: x })))),
        el('tbody', {}, list.map((g) => {
          const state = g.running ? 'green' : g.onboot ? 'red' : 'gray';
          return el('tr', { class: 'clickable', onclick: (e) => { if (!e.target.closest('a')) location.hash = `#/infra/${g.vmid}`; } },
            el('td', {}, dot(state, g.running ? 'running' : 'stopped')),
            el('td', { class: 'mono', text: String(g.vmid) }),
            el('td', {}, el('b', { text: g.name }), el('span', { class: 'type-tag', text: g.type === 'qemu' ? 'VM' : 'LXC' })),
            el('td', { class: 'sub', text: g.role || '' }),
            el('td', { class: 'num', text: g.running && g.cpu != null ? `${(g.cpu * 100).toFixed(1)}%` : '-' }),
            el('td', {}, g.running ? meter(g.memPct, { warn: 0.85, crit: 0.95 }) : '-'),
            el('td', {}, g.type === 'lxc' ? meter(g.diskPct) : el('span', { class: 'sub', text: 'n/a' })),
            el('td', { text: g.running ? fmtDur(g.uptime) : 'stopped' }),
            el('td', {}, g.backedUp ? el('span', { class: 'badge ok', text: 'yes' }) : el('span', { class: 'badge bad', text: 'none' })),
            el('td', {}, g.url ? el('span', { class: 'probe' }, g.probe ? dot(g.probe.ok ? 'green' : 'red', g.probe.ok ? `HTTP ${g.probe.status}` : g.probe.error || 'down') : null, extLink(g.url)) : null));
        })))));
      applyMeters(holder);
    };
    filter.addEventListener('input', draw);
    fill(body, 
      el('div', { class: 'grid grid-stats' },
        stat('Host', h.name || '-', `Proxmox ${h.version || ''} · up ${fmtDur(h.uptime)}`),
        stat('CPU', h.cpuPct != null ? `${h.cpuPct.toFixed(1)}%` : '-', `${h.cpus} cores · load ${h.load1}`),
        stat('Memory', h.memPct != null ? `${Math.round(h.memPct)}%` : '-', `of ${fmtBytes(h.memSize)}`),
        stat('Root disk', h.rootPct != null ? `${Math.round(h.rootPct)}%` : '-', 'Proxmox OS disk'),
        ...d.pools.map((p) => stat(`Pool ${p.name}`, p.pct != null ? `${Math.round(p.pct * 100)}%` : '-', `${fmtBytes(p.used)} of ${fmtBytes(p.size)}`))),
      el('div', { class: 'quick-links' }, el('span', { class: 'stat-label', text: 'Quick links' }), d.links.map((l) =>
        el('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', class: 'chip' }, l.probe ? dot(l.probe.ok ? 'green' : 'red') : null, l.name))),
      el('div', { class: 'toolbar' }, filter, el('span', { class: 'sub', text: `${d.guests.filter((g) => g.running).length} of ${d.guests.length} running` })),
      holder);
    draw();
  } catch (e) { fill(body, errorBox(e)); }
}

async function viewGuest(vmid, range = '24h') {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading…' }));
  const head = el('div');
  render(shell('Infrastructure', [head, body]));
  try {
    const [{ guest: g, history }, tgt] = await Promise.all([api(`/infra/${enc(vmid)}?range=${range}`), api('/actions/targets')]);
    const myTargets = tgt.targets.filter((t) => t.vmid === g.vmid);
    const reload = () => viewGuest(vmid, range);
    const actionBar = g.vmid === 136 ? el('span', { class: 'sub', text: 'This is Prxy Core itself' }) : el('div', { class: 'head-actions' },
      g.running ? null : el('button', { class: 'btn', onclick: () => runGuestAction(g, 'start', reload) }, icon('play'), 'Start'),
      g.running ? el('button', { class: 'btn secondary', onclick: () => runGuestAction(g, 'reboot', reload) }, icon('refresh'), 'Reboot') : null,
      g.running ? el('button', { class: 'btn secondary danger-text', onclick: () => runGuestAction(g, 'shutdown', reload) }, icon('out'), 'Shut down') : null,
      el('button', { class: 'btn secondary', onclick: () => runBackupNow(g) }, icon('save'), 'Back up now'));
    const dir = g.directory || {};
    fill(head, el('div', { class: 'page-head' }, el('div', {},
      el('div', { class: 'crumbs' }, el('a', { href: '#/infra', text: 'Infrastructure' }), el('span', { text: '/' }), el('span', { text: String(g.vmid) })),
      el('h1', {}, dot(g.running ? 'green' : g.onboot ? 'red' : 'gray'), ` ${g.name}`),
      el('p', { class: 'sub', text: [g.role, g.ip, g.type === 'qemu' ? 'VM' : 'LXC'].filter(Boolean).join(' · ') })),
      el('div', { class: 'head-actions' }, g.url ? extLink(g.url, 'Open web UI') : null, rangePicker(range, (r) => viewGuest(vmid, r)))),
      tgt.pve ? el('div', { class: 'action-bar' }, actionBar) : null);
    const units = dir.units || [];
    const howTo = dir.runtime === 'docker-host'
      ? 'Shared Docker host. Restart individual containers from the Docker page.'
      : units.length ? `Native systemd: ${units.join(', ')}. Manual restart: systemctl restart <unit> on this LXC.` : 'Native service inside its own LXC.';
    fill(body, 
      el('div', { class: 'grid grid-stats' },
        stat('CPU', g.running && g.cpu != null ? `${(g.cpu * 100).toFixed(1)}%` : '-', `${g.cpus} vCPU allotted`),
        stat('Memory', g.memPct != null ? `${Math.round(g.memPct * 100)}%` : '-', `${fmtBytes(g.memUsed)} of ${fmtBytes(g.memSize)}`),
        stat('Disk', g.diskPct != null ? `${Math.round(g.diskPct * 100)}%` : '-', `${fmtBytes(g.diskUsed)} of ${fmtBytes(g.diskSize)}`),
        stat('Uptime', g.running ? fmtDur(g.uptime) : 'stopped', g.onboot ? 'starts on boot' : 'manual start'),
        stat('Backup', g.backedUp ? 'Yes' : 'None', g.backedUp ? 'covered by a vzdump job' : 'not in any Proxmox backup job')),
      el('div', { class: 'alert info' }, icon('terminal'), el('span', { text: howTo })),
      dir.runtime === 'docker-host' ? null : serviceControls(myTargets, tgt.services),
      el('div', { class: 'chart-grid' },
        el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'CPU (% of allotted)' }), lineChart([{ name: 'CPU', values: history.cpu }], { fmt: fmtPctAuto })),
        el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'Memory used' }), lineChart([{ name: 'Memory', values: history.mem }], { fmt: fmtBytes })),
        el('div', { class: 'card wide' }, el('div', { class: 'stat-label', text: 'Network' }),
          lineChart([{ name: 'Received', values: history.rx }, { name: 'Sent', values: history.tx }], { fmt: fmtRate }))));
  } catch (e) { fill(body, errorBox(e)); }
}

// ---------- Docker ----------
async function viewDocker(range = '24h') {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading containers…' }));
  render(shell('Docker', [pageHead('Docker', 'Containers on mgmt-docker (LXC 110)', rangePicker(range, (r) => viewDocker(r))), body]));
  try {
    const d = await api(`/docker?range=${range}`);
    const out = el('div');
    const now = Date.now();
    const reload = () => viewDocker(range);

    const showLogs = async (c) => {
      fill(out, el('div', { class: 'spinner', text: `Loading logs for ${c.name}…` }));
      try {
        const r = await api(`/containers/${enc(c.name)}/logs?tail=300`);
        fill(out, el('div', { class: 'result-meta' }, el('b', { text: `${c.name} - last 300 lines` }), el('button', { class: 'btn secondary small push', onclick: () => fill(out) }, icon('close'), 'Close')),
          el('pre', { class: 'log-list log-pre', text: r.text.trim() || '(no output)' }));
        out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) { fill(out, errorBox(e)); }
    };
    const act = async (c, op) => {
      const critical = d.critical.includes(c.name);
      const verb = { restart: 'Restart', stop: 'Stop', start: 'Start' }[op];
      const answer = await confirmAction({
        title: `${verb} ${c.name}`,
        message: op === 'start' ? `Start container ${c.name}.` : `${verb} container ${c.name}. ${critical ? 'This is a critical service - things that depend on it will be briefly unavailable.' : 'It will be briefly unavailable.'}`,
        danger: op !== 'start', confirmName: op !== 'start' && critical ? c.name : null, button: verb,
      });
      if (!answer) return;
      try {
        fill(out, el('div', { class: 'spinner', text: `${verb} ${c.name}…` }));
        const r = await api('/actions/container', { method: 'POST', body: { name: c.name, op, ...answer } });
        toast(r.changed === false ? `${c.name}: already ${op === 'start' ? 'running' : 'stopped'}` : `${verb} ${c.name}: done`);
        setTimeout(reload, 1500);
      } catch (e) { fill(out, errorBox(e)); }
    };

    const healthCell = (c) => {
      if (c.restarting) return el('span', { class: 'badge warn', text: 'restarting' });
      if (c.health) return el('span', { class: `badge ${c.health === 'healthy' ? 'ok' : c.health === 'unhealthy' ? 'bad' : ''}`, text: c.health });
      return el('span', { class: 'sub', text: d.bridge.ok ? '-' : '' });
    };
    fill(body,
      !d.bridge.configured ? el('div', { class: 'alert info' }, icon('alert'), 'The Docker bridge is not set up yet, so health and the control buttons are unavailable.') : null,
      d.bridge.configured && !d.bridge.ok ? el('div', { class: 'alert warn' }, icon('alert'), `Cannot reach the Docker bridge (${d.bridge.error}). Showing monitoring data only.`) : null,
      el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ['', 'Container', 'Health', 'Image', 'CPU', 'Memory', 'Net in', 'Net out', 'Up for', '', ''].map((x, i) => el('th', { class: i >= 4 && i <= 7 ? 'num' : '', text: x })))),
        el('tbody', {}, d.containers.map((c) => el('tr', {},
          el('td', {}, dot(c.restarting ? 'amber' : c.running ? 'green' : 'red', c.restarting ? 'restarting' : c.running ? 'running' : 'stopped')),
          el('td', {}, el('b', { text: c.name }), c.restartCount ? el('span', { class: 'type-tag', text: `${c.restartCount} restarts` }) : null),
          el('td', {}, healthCell(c)),
          el('td', { class: 'mono sub', text: c.image || '' }),
          el('td', { class: 'num', text: c.cpuPct != null ? `${c.cpuPct.toFixed(2)}%` : '-' }),
          el('td', { class: 'num', text: fmtBytes(c.mem) }),
          el('td', { class: 'num', text: fmtRate(c.rx) }),
          el('td', { class: 'num', text: fmtRate(c.tx) }),
          el('td', { text: c.running && c.startedAt ? fmtDur((now - c.startedAt) / 1000) : c.running ? '-' : `stopped ${fmtDur(c.lastSeenAgo)} ago` }),
          el('td', {}, c.note ? el('span', { class: 'badge', title: c.note, text: 'known noise' }) : null),
          el('td', { class: 'row-btns' }, d.bridge.ok ? el('span', { class: 'btn-pair' },
            el('button', { class: 'icon-btn plain', title: 'Logs', 'aria-label': `Logs for ${c.name}`, onclick: () => showLogs(c) }, icon('file')),
            c.controlled ? (c.running
              ? [el('button', { class: 'icon-btn plain', title: 'Restart', 'aria-label': `Restart ${c.name}`, onclick: () => act(c, 'restart') }, icon('refresh')),
                 el('button', { class: 'icon-btn plain', title: 'Stop', 'aria-label': `Stop ${c.name}`, onclick: () => act(c, 'stop') }, icon('close'))]
              : el('button', { class: 'icon-btn plain', title: 'Start', 'aria-label': `Start ${c.name}`, onclick: () => act(c, 'start') }, icon('play'))) : null) : null)))))),
      out,
      el('div', { class: 'chart-grid' },
        el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'CPU - top 6 (% of one core)' }), lineChart(d.history.cpu, { fmt: fmtPctAuto })),
        el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'Memory - top 6' }), lineChart(d.history.mem, { fmt: fmtBytes }))),
      d.bridge.ok ? el('p', { class: 'sub hint', text: 'Restart, stop and start need a fresh authenticator code and are recorded in the Audit log. Critical containers also need their name typed. Viewing logs is recorded too.' }) : null);
  } catch (e) { fill(body, errorBox(e)); }
}

// ---------- Monitoring ----------
async function viewMonitoring() {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading…' }));
  render(shell('Monitoring', [pageHead('Monitoring', 'Alerts, scrape targets and log pipelines',
    el('a', { class: 'btn secondary', href: 'http://10.20.40.115:3000', target: '_blank', rel: 'noopener noreferrer' }, 'Grafana')), body]));
  try {
    const d = await api('/monitoring');
    const section = (title, ...kids) => [el('h3', { class: 'section-title', text: title }), ...kids];
    const errOr = (r, fn) => (r.error ? errorBox(new Error(r.error)) : fn(r.value));
    fill(body, 
      ...(d.rules.value === 0 ? [el('div', { class: 'alert warn' }, icon('alert'), el('span', { text: 'Prometheus has no alert rules, so Alertmanager can never notify you. The Overview page runs its own checks in the meantime.' }))] : []),
      ...section('Active alerts', errOr(d.alerts, (a) => a.alerts.length
        ? resultTable(['alert', 'severity', 'state', 'since', 'summary'], a.alerts.map((x) => [x.name, x.severity, x.state, new Date(x.startsAt).toLocaleString(), x.summary]))
        : el('div', { class: 'alert info' }, icon('check'), 'No alerts firing.'))),
      ...section('Silences', errOr(d.alerts, (a) => a.silences.length
        ? resultTable(['matchers', 'comment', 'by', 'ends'], a.silences.map((s) => [s.matchers.join(', '), s.comment, s.createdBy, new Date(s.endsAt).toLocaleString()]))
        : el('p', { class: 'sub', text: 'No active silences.' }))),
      ...section('Log pipelines (Loki)', errOr(d.logs, (logs) => el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ['', 'Feed', 'Lines last hour', 'Lines kept (24 h)', ''].map((x, i) => el('th', { class: i === 2 || i === 3 ? 'num' : '', text: x })))),
        el('tbody', {}, logs.map((l) => {
          const quiet = l.lastWeek > 1000 && l.lastHour === 0;
          return el('tr', {}, el('td', {}, dot(quiet ? 'amber' : l.lastHour ? 'green' : 'gray')), el('td', {}, el('b', { text: l.job })),
            el('td', { class: 'num', text: fmtNum(l.lastHour) }), el('td', { class: 'num', text: fmtNum(l.lastWeek) }),
            el('td', {}, el('a', { href: `#/logs?job=${enc(l.job)}`, text: 'View logs' })));
        })))))),
      ...section('Scrape targets (Prometheus)', errOr(d.targets, (t) => el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ['', 'Job', 'Endpoint', 'Last scrape', 'Duration', 'Error'].map((x) => el('th', { text: x })))),
        el('tbody', {}, t.map((x) => el('tr', {},
          el('td', {}, dot(x.health === 'up' ? 'green' : 'red', x.health)),
          el('td', {}, el('b', { text: x.job })),
          el('td', { class: 'mono', text: x.url }),
          el('td', { text: fmtAgo(x.lastScrape) }),
          el('td', { class: 'num', text: `${x.durationMs} ms` }),
          el('td', { class: 'sub', text: x.lastError || '' })))))))));
  } catch (e) { fill(body, errorBox(e)); }
}

// ---------- Logs ----------
function parseJSONLine(line) {
  if (!line || line[0] !== '{') return null;
  try { return JSON.parse(line); } catch { return null; }
}
function summarizeLine(line) {
  const j = parseJSONLine(line);
  if (!j) return line;
  if (j.src_addr && j.dst_addr) {
    const geo = j.geoip_country_name || j.dst_country || '';
    return `${j.proto || ''} ${j.src_addr}:${j.src_port ?? ''} → ${j.dst_addr}:${j.dst_port ?? ''}  ·  ${fmtBytes(j.bytes)}${j.packets ? ` / ${j.packets} pkt` : ''}${geo ? `  ·  ${geo}` : ''}`.trim();
  }
  return Object.entries(j).slice(0, 12).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join('  ');
}
function prettyLine(line) {
  const j = parseJSONLine(line);
  return j ? JSON.stringify(j, null, 2) : line;
}
function toggleLine(row) {
  const t = row.querySelector('.log-text');
  const open = row.classList.toggle('open');
  if (!t.dataset.short) t.dataset.short = t.textContent;
  t.textContent = open ? t.dataset.full : t.dataset.short;
}
async function viewLogs(params) {
  const form = el('div', { class: 'card log-form' }, el('div', { class: 'spinner', text: 'Loading labels…' }));
  const out = el('div');
  render(shell('Logs', [pageHead('Logs', 'Search Loki - network flows, UniFi and Suricata events'), form, out]));
  let labels;
  try { labels = (await api('/logs/labels')).labels; } catch (e) { fill(form, errorBox(e)); return; }
  const preferred = ['job', 'filename', 'host', 'service_name', 'proto', 'event_name', 'ap_name', 'ssid'];
  const names = [...preferred.filter((l) => labels[l]), ...Object.keys(labels).filter((l) => !preferred.includes(l) && !l.startsWith('geoip_')).sort()].slice(0, 6);
  const selects = Object.fromEntries(names.map((n) => [n, el('select', { 'aria-label': n },
    el('option', { value: '', text: `any ${n}` }), labels[n].map((v) => el('option', { value: v, text: v })))]));
  if (params.get('job') && selects.job) selects.job.value = params.get('job');
  else if (selects.job && labels.job.length) selects.job.value = labels.job.includes('netflow') ? 'netflow' : labels.job[0];
  const contains = el('input', { type: 'search', placeholder: 'Line contains… (e.g. an IP address)', class: 'grow' });
  const raw = el('input', { type: 'text', class: 'mono grow', placeholder: '{job="netflow"} | json | dst_port="443"' });
  const rawToggle = el('input', { type: 'checkbox' });
  const rangeSel = el('select', { 'aria-label': 'Range' }, ['1h', '6h', '24h', '7d'].map((r) => el('option', { value: r, text: `last ${r}` })));
  const limitSel = el('select', { 'aria-label': 'Limit' }, ['100', '200', '500', '1000'].map((r) => el('option', { value: r, text: `${r} lines` })));
  limitSel.value = '200';
  const rawRow = el('div', { class: 'toolbar hidden' }, raw);
  rawToggle.addEventListener('change', () => rawRow.classList.toggle('hidden', !rawToggle.checked));
  const run = async () => {
    fill(out, el('div', { class: 'spinner', text: 'Searching…' }));
    const body = { range: rangeSel.value, limit: Number(limitSel.value) };
    if (rawToggle.checked) body.raw = raw.value;
    else { body.labels = Object.fromEntries(names.map((n) => [n, selects[n].value]).filter(([, v]) => v)); body.contains = contains.value || undefined; }
    try {
      const r = await api('/logs/query', { method: 'POST', body });
      fill(out, 
        el('div', { class: 'result-meta' }, el('span', { text: `${fmtNum(r.lines.length)} lines` }), el('code', { class: 'sub', text: r.query })),
        r.lines.length ? el('div', { class: 'log-list' }, r.lines.map((l) => el('div', { class: 'log-line', title: 'Click to expand', onclick: (e) => toggleLine(e.currentTarget) },
          el('span', { class: 'log-ts', text: new Date(l.ts).toLocaleString() }),
          el('span', { class: 'log-text', 'data-full': prettyLine(l.line), text: summarizeLine(l.line) })))) : el('div', { class: 'empty', text: 'No lines matched.' }));
    } catch (e) { fill(out, errorBox(e)); }
  };
  [contains, raw].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); }));
  fill(form, 
    el('div', { class: 'toolbar' }, names.map((n) => selects[n])),
    el('div', { class: 'toolbar' }, contains, rangeSel, limitSel, el('label', { class: 'check' }, rawToggle, 'Raw LogQL'),
      el('button', { class: 'btn', onclick: run }, icon('play'), 'Search')),
    rawRow);
  run();
}

// ---------- Phase 2b: actions ----------
// Step-up dialog: every state-changing action needs a fresh authenticator code,
// and destructive ones also need the guest's name typed out.
function confirmAction({ title, message, danger = false, confirmName = null, button = 'Confirm' }) {
  return new Promise((resolve) => {
    const code = el('input', { class: 'field mono', inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', id: 'stepup-code', required: true });
    const name = confirmName ? el('input', { class: 'field mono', id: 'stepup-name', autocomplete: 'off', required: true }) : null;
    const err = el('div');
    const dlg = el('dialog', { class: 'dialog' });
    const close = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.append(el('form', { method: 'dialog', onsubmit: (e) => {
      e.preventDefault();
      if (!/^\d{6}$/.test(code.value.trim())) { err.replaceChildren(el('div', { class: 'alert error', text: 'Enter the 6-digit code from your authenticator app.' })); return; }
      if (name && name.value.trim() !== confirmName) { err.replaceChildren(el('div', { class: 'alert error', text: `Type ${confirmName} exactly to confirm.` })); return; }
      close({ code: code.value.trim(), confirm: name ? name.value.trim() : undefined });
    } },
      el('h2', {}, icon(danger ? 'alert' : 'lock'), ` ${title}`),
      el('p', { class: 'sub', text: message }),
      err,
      name ? [el('label', { for: 'stepup-name' }, 'Type ', el('code', { text: confirmName }), ' to confirm'), name] : null,
      el('label', { for: 'stepup-code', text: 'Authenticator code' }), code,
      el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', class: 'btn secondary', onclick: () => close(null) }, 'Cancel'),
        el('button', { type: 'submit', class: danger ? 'btn danger' : 'btn' }, button))));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    document.body.appendChild(dlg);
    dlg.showModal();
    (name || code).focus();
  });
}

// Polls a Proxmox task until it finishes; resolves with its exit status.
async function waitTask(upid, onTick) {
  for (let i = 0; i < 400; i++) {
    const t = await api(`/tasks/${enc(upid)}`).catch(() => null);
    if (t && t.status === 'stopped') return t.exitstatus;
    if (onTick) onTick(i);
    await new Promise((r) => setTimeout(r, 3000));
  }
  return 'timeout';
}

async function runGuestAction(g, op, after) {
  const verbs = { start: 'Start', shutdown: 'Shut down', reboot: 'Reboot' };
  const answer = await confirmAction({
    title: `${verbs[op]} ${g.name}`,
    message: op === 'start' ? `Start ${g.name} (${g.vmid}).` : `${verbs[op]} ${g.name} (${g.vmid}). Everything running inside it will be ${op === 'reboot' ? 'briefly unavailable' : 'unavailable until it is started again'}.`,
    danger: op !== 'start', confirmName: op === 'start' ? null : g.name, button: verbs[op],
  });
  if (!answer) return;
  try {
    const { upid } = await api('/actions/guest', { method: 'POST', body: { vmid: g.vmid, op, ...answer } });
    toast(`${verbs[op]}: started…`);
    const status = await waitTask(upid);
    toast(status === 'OK' ? `${verbs[op]} ${g.name}: done` : `${verbs[op]} ${g.name}: ${status}`);
    if (after) after();
  } catch (e) { toast(e.message); }
}

async function runBackupNow(g, after) {
  const answer = await confirmAction({ title: `Back up ${g.name} now`, message: `Creates a snapshot backup of ${g.name} (${g.vmid}) on the backups storage. The guest keeps running.`, button: 'Start backup' });
  if (!answer) return;
  try {
    const { upid } = await api('/backups/run', { method: 'POST', body: { vmid: g.vmid, ...answer } });
    toast(`Backup of ${g.name} started`);
    const status = await waitTask(upid);
    toast(status === 'OK' ? `Backup of ${g.name} finished` : `Backup of ${g.name}: ${status}`);
    if (after) after();
  } catch (e) { toast(e.message); }
}

async function runServiceAction(t, op, out) {
  if (op === 'restart') {
    const answer = await confirmAction({ title: `Restart ${t.name}`, message: `Restart ${t.kind === 'docker' ? 'container' : 'service'} ${t.name} on LXC ${t.vmid}. It will be briefly unavailable.`, danger: true, button: 'Restart' });
    if (!answer) return;
    try {
      fill(out, el('div', { class: 'spinner', text: `Restarting ${t.name}…` }));
      const r = await api('/actions/service', { method: 'POST', body: { vmid: t.vmid, name: t.name, op, ...answer } });
      fill(out, el('div', { class: 'alert info' }, icon('check'), el('span', { text: `${t.name} restarted (${(r.ms / 1000).toFixed(1)} s).` })));
    } catch (e) { fill(out, errorBox(e)); }
    return;
  }
  fill(out, el('div', { class: 'spinner', text: 'Asking the server…' }));
  try {
    const r = await api('/actions/service', { method: 'POST', body: { vmid: t.vmid, name: t.name, op } });
    fill(out, el('div', { class: 'result-meta' }, el('b', { text: `${t.name} - ${op}` })),
      el('pre', { class: 'log-list log-pre', text: r.output.trim() || '(no output)' }));
  } catch (e) { fill(out, errorBox(e)); }
}

function serviceControls(targets, servicesReady) {
  if (!targets.length) return null;
  if (!servicesReady) {
    return el('div', { class: 'card' },
      el('div', { class: 'stat-label', text: 'Services on this guest' }),
      el('p', { class: 'sub hint', text: 'Prxy Core is read-only for services (by choice). To restart one, run the command below on this LXC.' }),
      el('div', { class: 'svc-list' }, targets.map((t) => el('div', { class: 'svc-row' },
        el('span', { class: 'svc-name' }, el('b', { text: t.name }), el('span', { class: 'type-tag', text: t.kind === 'docker' ? 'DOCKER' : 'SYSTEMD' })),
        el('code', { class: 'cmd', text: t.kind === 'docker' ? `docker restart ${t.name}` : `systemctl restart ${t.name}` })))));
  }
  const out = el('div');
  return el('div', { class: 'card' },
    el('div', { class: 'stat-label', text: 'Services on this guest' }),
    servicesReady ? null : el('p', { class: 'sub hint', text: 'Restart, status and logs need the SSH action channel, which is waiting for approval. See the Guide.' }),
    el('div', { class: 'svc-list' }, targets.map((t) => el('div', { class: 'svc-row' },
      el('span', { class: 'svc-name' }, el('b', { text: t.name }), el('span', { class: 'type-tag', text: t.kind === 'docker' ? 'DOCKER' : 'SYSTEMD' })),
      el('div', { class: 'svc-btns' },
        el('button', { class: 'btn secondary small', disabled: !servicesReady, onclick: () => runServiceAction(t, 'status', out) }, 'Status'),
        el('button', { class: 'btn secondary small', disabled: !servicesReady, onclick: () => runServiceAction(t, 'logs', out) }, icon('file'), 'Logs'),
        el('button', { class: 'btn secondary small', disabled: !servicesReady, onclick: () => runServiceAction(t, 'restart', out) }, icon('refresh'), 'Restart'))))),
    out);
}

// ---------- Backups ----------
// Proxmox returns retention either as "keep-last=3,keep-weekly=1" or as an object.
function pruneText(prune) {
  if (!prune) return 'all';
  const entries = typeof prune === 'string' ? prune.split(',').map((x) => x.split('=')) : Object.entries(prune);
  return entries.map(([k, v]) => `${k.replace('keep-', '')} ${v}`).join(', ');
}
async function viewBackups() {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading backups…' }));
  render(shell('Backups', [pageHead('Backups', 'Proxmox snapshot backups of every guest, plus app-level backups'), body]));
  try {
    const d = await api('/backups');
    const now = Date.now() / 1000;
    const pveFiles = d.files.filter((f) => f.storage === 'backups' || f.storage === 'local');
    const byVmid = {};
    pveFiles.forEach((f) => { (byVmid[f.vmid] = byVmid[f.vmid] || []).push(f); });
    Object.values(byVmid).forEach((l) => l.sort((a, b) => b.ctime - a.ctime));
    const job = d.jobs[0];
    const excluded = new Set((job && job.exclude ? job.exclude.split(',') : []).map(Number));
    const rows = d.guests.map((g) => {
      const list = byVmid[g.vmid] || [];
      const last = list[0];
      const age = last ? now - last.ctime : null;
      const level = excluded.has(g.vmid) ? (last ? 'gray' : 'gray') : !last ? 'red' : age > 26 * 3600 ? 'amber' : 'green';
      return { g, list, last, age, level };
    });
    const fresh = rows.filter((r) => r.level === 'green').length;
    const covered = rows.filter((r) => !excluded.has(r.g.vmid)).length;
    const store = d.storages.find((s) => s.name === (job ? job.storage : 'backups'));
    const running = d.tasks.filter((t) => t.status === 'running');
    const totalSize = pveFiles.reduce((a, f) => a + f.size, 0);

    fill(body, 
      running.length ? el('div', { class: 'alert warn' }, icon('refresh'), el('span', { text: `Backup running now: ${running.map((t) => t.vmid || 'all').join(', ')}` })) : null,
      el('div', { class: 'grid grid-stats' },
        stat('Protected', `${fresh} / ${covered}`, 'guests backed up in the last 26 h'),
        stat('Schedule', job ? `daily ${job.schedule}` : 'none', job ? `keeps ${pruneText(job.prune)} · ${job.enabled ? 'enabled' : 'DISABLED'}` : 'no backup job'),
        stat('Next run', job && job.nextRun ? new Date(job.nextRun * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '-', job ? job.comment : ''),
        stat('Storage used', store ? `${Math.round((store.used / store.total) * 100)}%` : '-', store ? `${fmtBytes(store.used)} of ${fmtBytes(store.total)}` : ''),
        stat('Backup files', String(pveFiles.length), `${fmtBytes(totalSize)} total`)),
      el('div', { class: 'alert info' }, icon('alert'), el('span', { text: 'Backups live on the same NVMe as the guests. They protect against mistakes and corruption, not against that disk failing. An off-disk copy (USB drive, NAS or cloud) is the next step.' })),
      el('h3', { class: 'section-title', text: 'Per guest' }),
      el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ['', 'VMID', 'Guest', 'Last backup', 'Size', 'Copies', ''].map((x, i) => el('th', { class: i === 4 || i === 5 ? 'num' : '', text: x })))),
        el('tbody', {}, rows.map((r) => el('tr', {},
          el('td', {}, dot(r.level)),
          el('td', { class: 'mono', text: String(r.g.vmid) }),
          el('td', {}, el('b', { text: r.g.name }), el('span', { class: 'type-tag', text: r.g.type === 'qemu' ? 'VM' : 'LXC' }),
            excluded.has(r.g.vmid) ? el('span', { class: 'badge', text: 'not in nightly job' }) : null),
          el('td', { text: r.last ? `${fmtDur(r.age)} ago · ${new Date(r.last.ctime * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'never' }),
          el('td', { class: 'num', text: r.last ? fmtBytes(r.last.size) : '-' }),
          el('td', { class: 'num', text: String(r.list.length) }),
          el('td', {}, r.g.vmid === 136 ? null : el('button', { class: 'btn secondary small', onclick: () => runBackupNow(r.g, () => viewBackups()) }, icon('save'), 'Back up now'))))))),
      el('h3', { class: 'section-title', text: 'Recent backup runs' }),
      d.tasks.length ? resultTable(['started', 'guest', 'duration', 'result', 'by'], d.tasks.slice(0, 15).map((t) => [
        new Date(t.start * 1000).toLocaleString(), t.vmid || 'all', t.end ? fmtDur(t.end - t.start).replace(' min', ' min') : 'running', t.status, t.user]))
        : el('p', { class: 'sub', text: 'No backup runs recorded yet.' }),
      el('h3', { class: 'section-title', text: 'App-level backups' }),
      ...(Array.isArray(d.app) ? d.app : []).map((a) => el('div', { class: 'card app-backup' },
        el('div', { class: 'db-card-head' }, el('b', { text: a.title }), a.ok ? el('span', { class: 'badge ok', text: `${a.files.length} files` }) : el('span', { class: 'badge warn', text: a.notSetUp ? 'not set up' : 'error' })),
        el('p', { class: 'sub mono', text: `${a.host}:${a.path}` }),
        a.ok && a.files.length ? el('p', { class: 'sub', text: `Newest: ${a.files[0].name} · ${fmtAgo(new Date(a.files[0].mtime).toISOString())} · ${fmtBytes(a.files[0].size)}` })
          : el('p', { class: 'sub', text: a.error || 'No files.' }))));
  } catch (e) { fill(body, errorBox(e)); }
}

// ---------- Power ----------
async function viewPower(range = '24h') {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading…' }));
  render(shell('Power', [pageHead('Power', 'Aferiy UPS via the exporter on LXC 132', rangePicker(range, (r) => viewPower(r))), body]));
  try {
    const p = await api(`/power?range=${range}`);
    const state = p.stale ? ['gray', 'No live readings - figures below are the last known values'] : p.onBattery ? ['red', 'Running on battery'] : ['green', 'On mains power'];
    fill(body, 
      el('div', { class: `headline ${state[0]}` }, dot(state[0]), state[1],
        el('span', { class: 'sub headline-note', text: p.lastSeenAgo != null ? `last reading ${fmtDur(p.lastSeenAgo)} ago` : 'no readings' })),
      el('div', { class: 'grid grid-stats' },
        stat('Battery', p.battery != null ? `${Math.round(p.battery)}%` : '-', p.battery != null && p.battery < 50 ? 'low' : 'charge'),
        stat('Load', p.outputW != null ? `${Math.round(p.outputW)} W` : '-', 'drawn by the lab'),
        stat('Input', p.inputW != null ? `${Math.round(p.inputW)} W` : '-', 'from the wall'),
        stat('Runtime', p.runtimeS != null ? fmtDur(p.runtimeS) : '-', 'estimated on battery at this load')),
      p.stale ? el('div', { class: 'alert warn' }, icon('alert'), el('span', { text: 'The UPS only sends a reading when something asks it (for example when its phone app is open), and the exporter on LXC 132 just listens. So these figures can be hours old and a power cut might not show up here. The fix is to make the exporter poll the UPS itself.' })) : null,
      el('div', { class: 'chart-grid' },
        el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'Battery %' }), lineChart([{ name: 'Battery', values: p.history.battery }], { fmt: (v) => `${Math.round(v)}%`, max: 100 })),
        el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'Power (W)' }), lineChart([{ name: 'Load', values: p.history.load }, { name: 'Input', values: p.history.input }], { fmt: (v) => `${Math.round(v)} W` }))),
      el('h3', { class: 'section-title', text: 'If the power goes out' }),
      el('div', { class: 'card' }, el('ol', { class: 'plain-list' },
        el('li', { text: 'Prxy Core flags "Running on battery" in red on the Overview as soon as input power drops.' }),
        el('li', { text: 'Planned: a graceful shutdown order - non-essential guests first (VMs, games, AI), then apps, then databases, Proxmox last - triggered at a battery threshold you choose.' }),
        el('li', { text: 'Planned: Discord notification when on battery and when power returns (once Discord alerts are set up).' }))));
  } catch (e) { fill(body, errorBox(e)); }
}

// ---------- Security ----------
async function viewSecurity() {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Checking security signals…' }));
  render(shell('Security', [pageHead('Security', 'New devices, failed logins and intrusion-detection health'), body]));
  try {
    const d = await api('/security');
    const dev = d.devices; const lg = d.logins || {}; const ids = d.ids || {};
    const unknownWifi = dev.wifi.filter((x) => !x.known);
    const unknownLan = dev.lan.filter((x) => !x.known);
    const ago = (sec) => fmtAgo(new Date(sec * 1000).toISOString());
    const idsQuiet = ids.total != null && ids.alerts7d === 0;

    const ack = async (keys, all) => {
      try { await api('/security/devices/ack', { method: 'POST', body: all ? { all: true } : { keys } }); toast('Marked as known'); viewSecurity(); } catch (e) { toast(e.message); }
    };
    const deviceRow = (x, withAck) => el('tr', {},
      el('td', {}, dot(x.known ? 'green' : 'amber', x.known ? 'known' : 'new')),
      el('td', {}, x.name ? el('b', { text: x.name }) : null, x.name ? el('br') : null, el('span', { class: 'mono sub', text: x.key })),
      el('td', { class: 'mono', text: x.ip || '' }),
      el('td', { text: [x.ssid, x.network].filter(Boolean).join(' · ') }),
      el('td', { text: x.ap || '' }),
      el('td', { text: ago(x.first_seen) }),
      el('td', { text: ago(x.last_seen) }),
      withAck ? el('td', {}, el('button', { class: 'btn secondary small', onclick: () => ack([x.key]) }, icon('check'), 'Known')) : null);
    const devHead = (ackCol) => el('thead', {}, el('tr', {}, ['', 'Device', 'IP', 'Network', 'Access point', 'First seen', 'Last seen', ackCol ? '' : null].filter((x) => x !== null).map((x) => el('th', { text: x }))));

    const filter = el('input', { type: 'search', placeholder: 'Filter known devices by name, MAC, IP or SSID…', class: 'grow' });
    const known = el('div');
    const drawKnown = () => {
      const f = filter.value.toLowerCase();
      const list = dev.wifi.filter((x) => x.known && (!f || `${x.name || ''} ${x.key} ${x.ip || ''} ${x.ssid || ''} ${x.network || ''}`.toLowerCase().includes(f)));
      fill(known, el('div', { class: 'table-wrap' }, el('table', { class: 'data' }, devHead(false),
        el('tbody', {}, list.length ? list.map((x) => deviceRow(x, false)) : el('tr', {}, el('td', { colspan: 7, class: 'empty', text: 'No devices match.' }))))));
    };
    filter.addEventListener('input', drawKnown);

    const level = lg.fail_1h >= 20 || unknownWifi.length ? 'amber' : 'green';
    fill(body,
      el('div', { class: `headline ${level}` }, dot(level),
        unknownWifi.length ? `${unknownWifi.length} new Wi-Fi device${unknownWifi.length > 1 ? 's' : ''} to review` : 'Nothing needs review right now'),
      el('div', { class: 'grid grid-stats' },
        stat('Wi-Fi devices', String(dev.wifi.length), `${unknownWifi.length} new · ${dev.wifi.filter((x) => x.last_seen > Date.now() / 1000 - 86400).length} active today`),
        stat('Failed logins (24 h)', lg.fail_24h != null ? String(lg.fail_24h) : '-', lg.fail_1h != null ? `${lg.fail_1h} in the last hour · AutoTrack` : ''),
        stat('Locked accounts', lg.lockedAccounts != null ? String(lg.lockedAccounts) : '-', 'AutoTrack'),
        stat('Intrusion alerts (7 d)', ids.alerts7d != null ? String(ids.alerts7d) : '-', ids.total != null ? `${fmtNum(ids.total)} Suricata log lines` : 'Loki unavailable'),
        stat('Suricata last started', ids.lastStart ? fmtAgo(new Date(ids.lastStart).toISOString()) : '-', ids.lastStart ? new Date(ids.lastStart).toLocaleString() : '')),

      unknownWifi.length ? [
        el('h3', { class: 'section-title' }, 'New Wi-Fi devices', el('button', { class: 'btn secondary small push', onclick: () => ack([], true) }, icon('check'), 'Mark all known')),
        el('p', { class: 'sub', text: 'Devices that appeared after the baseline was taken. Phones using a private Wi-Fi address show up as "new" whenever that address rotates.' }),
        el('div', { class: 'table-wrap' }, el('table', { class: 'data' }, devHead(true), el('tbody', {}, unknownWifi.map((x) => deviceRow(x, true)))))] : null,
      unknownLan.length ? [
        el('h3', { class: 'section-title', text: 'New LAN addresses (from NetFlow)' }),
        el('div', { class: 'table-wrap' }, el('table', { class: 'data' }, devHead(true), el('tbody', {}, unknownLan.slice(0, 30).map((x) => deviceRow(x, true)))))] : null,

      el('h3', { class: 'section-title', text: 'Failed logins - AutoTrack (last 24 hours)' }),
      lg.error ? errorBox(new Error(lg.error)) : (lg.topIps && lg.topIps.length ? el('div', { class: 'chart-grid' },
        el('div', {}, el('div', { class: 'stat-label', text: 'By source address' }), resultTable(['address', 'failures', 'emails tried', 'last'], lg.topIps.map((x) => [x.ip_address, x.failures, x.emails, new Date(x.last).toLocaleString()]))),
        el('div', {}, el('div', { class: 'stat-label', text: 'By account' }), resultTable(['email', 'failures', 'addresses', 'last'], lg.topEmails.map((x) => [x.email, x.failures, x.ips, new Date(x.last).toLocaleString()]))))
        : el('div', { class: 'alert info' }, icon('check'), 'No failed AutoTrack logins in the last 24 hours.')),
      lg.prxyCoreFailures && lg.prxyCoreFailures.length ? [el('h3', { class: 'section-title', text: 'Failed sign-ins to Prxy Core (24 h)' }),
        resultTable(['address', 'failures', 'last (UTC)'], lg.prxyCoreFailures.map((x) => [(x.ip || '').replace('::ffff:', ''), x.failures, x.last]))] : null,

      el('h3', { class: 'section-title', text: 'Intrusion detection (Suricata on OPNsense)' }),
      ids.error ? errorBox(new Error(ids.error)) : el('div', { class: 'card' },
        el('p', {}, idsQuiet
          ? 'Suricata is running, but no alerts have reached Loki in 7 days. Only its startup messages arrive. That means either nothing triggered a rule, or alerts are not being forwarded.'
          : `${ids.alerts7d} alert line(s) received in the last 7 days (${ids.alerts24h} in the last 24 hours).`),
        idsQuiet ? el('ol', { class: 'plain-list' },
          el('li', { text: 'OPNsense → Services → Intrusion Detection → Administration → Settings: in Divert (IPS) mode Suricata only sees traffic that a firewall rule sends to it with the "Divert-to" option. If no rule has it, nothing is inspected (the old engine log said "Treated: Pkts 0"). Either set Divert-to on the rules you want inspected, or switch Capture mode to PCAP live mode and pick the VLAN interfaces.' }),
          el('li', { text: 'Same page, Download tab: confirm at least one ruleset is enabled and has been downloaded.' }),
          el('li', { text: 'System → Settings → Logging → Targets: the entry for 10.20.40.133 (UDP 514) should include the Informational level (alerts are sent at local5.info) and the suricata application.' })) : null),
      ids.recent && ids.recent.length ? [el('h3', { class: 'section-title', text: 'Recent alerts' }),
        el('div', { class: 'log-list' }, ids.recent.map((l) => el('div', { class: 'log-line' }, el('span', { class: 'log-ts', text: new Date(l.ts).toLocaleString() }), el('span', { class: 'log-text', text: l.line }))))] : null,

      el('h3', { class: 'section-title', text: `Known Wi-Fi devices (${dev.wifi.filter((x) => x.known).length})` }),
      el('div', { class: 'toolbar' }, filter), known,
      el('p', { class: 'sub hint', text: dev.collector.error ? `Device collector error: ${dev.collector.error}` : `Inventory updates every 15 minutes from UniFi events${dev.collector.at ? ` · last run ${fmtAgo(new Date(dev.collector.at).toISOString())}` : ''}.` }));
    drawKnown();
  } catch (e) { fill(body, errorBox(e)); }
}

// ---------- Net View ----------
// ---------- Net View: UniFi switches, access points, clients ----------
const BAND_NAME = { ng: '2.4 GHz', na: '5 GHz', '6e': '6 GHz' };
const bitsOf = (bps) => (bps == null ? '-' : fmtBits(bps / 1e6));

function portGrid(sw) {
  const half = Math.ceil(sw.ports.length / 2);
  return el('div', { class: 'ports', style: null }, sw.ports.map((p) => {
    const cls = !p.up ? 'down' : p.speedMbps && p.speedMbps < 1000 ? 'slow' : 'up';
    const who = p.attached.length ? p.attached.map((a) => a.name).join(', ') : (p.name || '');
    return el('div', { class: `port ${cls}${p.poe ? ' poe' : ''}${p.isUplink ? ' uplink' : ''}`,
      title: `Port ${p.idx}${p.name ? ` "${p.name}"` : ''} - ${p.up ? `${p.speedMbps} Mbps` : 'no link'}${p.poe ? ` - PoE ${p.poeW != null ? p.poeW.toFixed(1) + ' W' : ''}` : ''}${who ? ` - ${who}` : ''}` },
    el('b', { text: String(p.idx) }), el('span', { class: 'pn', text: (who || (p.up ? '' : '')).slice(0, 12) }));
  }).slice(0, half * 2));
}

function attachedLabel(list) {
  const groups = {};
  list.forEach((a) => { groups[a.name] = (groups[a.name] || 0) + 1; });
  const names = Object.entries(groups);
  return names.slice(0, 3).map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
}

function switchCard(sw) {
  const active = sw.ports.filter((p) => p.up);
  const up = sw.uplink ? `uplink: ${sw.uplink.name || 'gateway'}${sw.uplink.port ? ` port ${sw.uplink.port}` : ''}` : 'uplink: router';
  return el('div', { class: 'card sw-card' },
    el('div', { class: 'db-card-head' }, el('div', {}, el('b', { text: sw.name }), el('span', { class: 'type-tag', text: sw.model })),
      sw.state === 1 ? el('span', { class: 'badge ok', text: 'online' }) : el('span', { class: 'badge bad', text: 'offline' })),
    el('p', { class: 'sub', text: [sw.ip, sw.uptime != null ? `up ${fmtDur(sw.uptime)}` : null, sw.temp != null ? `${sw.temp}°C` : null, sw.poeMaxW ? `PoE ${sw.poeUsedW.toFixed(1)} of ${sw.poeMaxW} W` : null, up].filter(Boolean).join(' · ') }),
    portGrid(sw),
    el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, ['Port', 'Connected', 'Link', 'PoE', 'To switch', 'From switch', 'Err'].map((x, i) => el('th', { class: i >= 4 && i <= 6 ? 'num' : '', title: i === 4 ? 'Traffic the device sends into the switch' : i === 5 ? 'Traffic the switch sends to the device' : null, text: x })))),
      el('tbody', {}, active.map((p) => el('tr', {},
        el('td', { class: 'mono', text: String(p.idx) }),
        el('td', {}, p.attached.length ? attachedLabel(p.attached) : el('span', { class: 'sub', text: p.name || '-' }),
          p.isUplink ? el('span', { class: 'badge', text: 'uplink' }) : null,
          p.attached.some((a) => a.kind === 'device') && p.macCount > 1 ? el('span', { class: 'type-tag', text: `${p.macCount} devices behind` }) : null),
        el('td', { class: p.speedMbps && p.speedMbps < 1000 ? 'warn-text' : '', text: p.speedMbps ? (p.speedMbps >= 1000 ? `${p.speedMbps / 1000} Gbps` : `${p.speedMbps} Mbps`) : '-' }),
        el('td', { class: 'num', text: p.poe && p.poeW != null ? `${p.poeW.toFixed(1)} W` : '' }),
        el('td', { class: 'num', text: bitsOf(p.rxBps) }), el('td', { class: 'num', text: bitsOf(p.txBps) }),
        el('td', { class: 'num', text: p.errors ? String(p.errors) : '' })))))));
}

function apCard(ap) {
  return el('div', { class: 'card sw-card' },
    el('div', { class: 'db-card-head' }, el('div', {}, el('b', { text: ap.name }), el('span', { class: 'type-tag', text: ap.model })),
      ap.state === 1 ? el('span', { class: 'badge ok', text: 'online' }) : el('span', { class: 'badge bad', text: 'offline' })),
    el('p', { class: 'sub', text: [ap.ip, ap.uptime != null ? `up ${fmtDur(ap.uptime)}` : null, ap.uplink ? `on ${ap.uplink.name || 'switch'}${ap.uplink.port ? ` port ${ap.uplink.port}` : ''}${ap.uplink.speedMbps ? ` @ ${ap.uplink.speedMbps >= 1000 ? ap.uplink.speedMbps / 1000 + ' Gbps' : ap.uplink.speedMbps + ' Mbps'}` : ''}` : null, `${ap.clients ?? 0} clients`].filter(Boolean).join(' · ') }),
    el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, ['Radio', 'Channel', 'Clients', 'Busy', 'Retries', 'Quality'].map((x, i) => el('th', { class: i >= 1 ? 'num' : '', text: x })))),
      el('tbody', {}, (ap.radios || []).map((r) => el('tr', {},
        el('td', { text: BAND_NAME[r.band] || r.band || '-' }),
        el('td', { class: 'num', text: r.channel != null ? `${r.channel}${r.width ? ` / ${r.width} MHz` : ''}` : '-' }),
        el('td', { class: 'num', text: String(r.clients ?? 0) }),
        el('td', { class: `num${r.utilPct >= 80 ? ' warn-text' : ''}`, text: r.utilPct != null ? `${r.utilPct}%` : '-' }),
        el('td', { class: `num${r.retriesPct >= 15 ? ' warn-text' : ''}`, text: r.retriesPct != null ? `${r.retriesPct}%` : '-' }),
        el('td', { class: 'num', text: r.satisfaction != null && r.satisfaction >= 0 ? `${r.satisfaction}%` : '-' })))))),
    (ap.ssids || []).length ? el('p', { class: 'sub hint', text: 'Networks: ' + ap.ssids.filter((s, i, a) => a.findIndex((x) => x.essid === s.essid && x.radio === s.radio) === i).map((s) => `${s.essid} (${BAND_NAME[s.radio] || s.radio}, ${s.clients ?? 0})`).join(' · ') }) : null);
}

function clientsPanel(uf) {
  const filter = el('input', { type: 'search', placeholder: 'Filter by name, address, network or access point…', class: 'grow', value: netFilterText });
  const holder = el('div');
  const rows = [...uf.clients].sort((a, b) => ((b.rxBps || 0) + (b.txBps || 0)) - ((a.rxBps || 0) + (a.txBps || 0)) || String(a.name || a.mac).localeCompare(String(b.name || b.mac)));
  const draw = () => {
    const f = filter.value.toLowerCase();
    const list = rows.filter((c) => !f || `${c.name || ''} ${c.oui || ''} ${c.mac} ${c.ip || ''} ${c.network || ''} ${c.ssid || ''} ${c.apName || ''} ${c.swName || ''}`.toLowerCase().includes(f));
    fill(holder, el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, ['Device', 'Address', 'Network', 'Connected via', 'Link', 'Up', 'Down', 'Quality'].map((x, i) => el('th', { class: i >= 5 ? 'num' : '', text: x })))),
      el('tbody', {}, list.length ? list.map((c) => el('tr', {},
        el('td', {}, c.name ? el('b', { text: c.name }) : el('span', { text: c.oui || 'unknown' }), el('br'), el('span', { class: 'mono sub', text: c.mac })),
        el('td', { class: 'mono', text: c.ip || '' }),
        el('td', { text: c.network ? `${c.network}${c.vlan ? ` (${c.vlan})` : ''}` : '' }),
        el('td', { text: c.wired ? `${c.swName || 'switch'}${c.swPort ? ` port ${c.swPort}` : ''}` : `${c.apName || 'AP'} · ${BAND_NAME[c.band] || c.band || ''}${c.signal != null ? ` · ${c.signal} dBm` : ''}${c.ssid ? ` · ${c.ssid}` : ''}` }),
        el('td', { text: c.wired ? 'wired' : (c.rxRateKbps ? `${Math.round(c.rxRateKbps / 1000)} / ${Math.round(c.txRateKbps / 1000)} Mbps` : '') }),
        el('td', { class: 'num', text: c.rxBps ? bitsOf(c.rxBps) : '' }), el('td', { class: 'num', text: c.txBps ? bitsOf(c.txBps) : '' }),
        el('td', { class: 'num', text: c.satisfaction != null && c.satisfaction >= 0 ? `${c.satisfaction}%` : '' }))) : el('tr', {}, el('td', { colspan: 8, class: 'empty', text: 'No devices match.' }))))));
  };
  filter.addEventListener('input', () => { netFilterText = filter.value; draw(); });
  draw();
  return [el('h3', { class: 'section-title', text: `Everything connected now (${uf.clients.length})` }),
    el('div', { class: 'toolbar' }, filter, el('span', { class: 'sub', text: `${uf.clients.filter((c) => !c.wired).length} Wi-Fi · ${uf.clients.filter((c) => c.wired).length} wired` })), holder];
}

function unifiPanels(uf) {
  if (!uf) return null;
  const sws = uf.devices.filter((d) => d.type === 'usw'); const aps = uf.devices.filter((d) => d.type === 'uap');
  return [
    el('h3', { class: 'section-title', text: 'Switches' }), el('div', { class: 'grid grid-cards' }, sws.map(switchCard)),
    el('h3', { class: 'section-title', text: 'Access points' }), el('div', { class: 'grid grid-cards' }, aps.map(apCard)),
    clientsPanel(uf),
  ];
}

function shadowBanner(r) {
  if (!r || !r.shadowed || !r.shadowed.length) return null;
  return [el('h3', { class: 'section-title', text: 'Rules that can never match' }),
    el('p', { class: 'sub', text: 'OPNsense uses the first matching rule. These rules sit below a rule that already matches everything from that network, so they have no effect. Move them above it, or delete them.' }),
    el('div', { class: 'checks' }, r.shadowed.map((x) => el('div', { class: 'check-row amber' }, dot('amber'), el('span', { class: 'check-area', text: x.interface }),
      el('span', { class: 'check-main' }, el('b', { text: `${x.action}: ${x.rule}` }), el('span', { class: 'sub', text: `is below ${x.covers}` })), null)))];
}

function ruleChangeBanner(l, m) {
  const r = l.rules;
  if (!r || !r.changes || !r.changes.length) return null;
  const ack = async (keys, all) => { try { await api('/network/rules/ack', { method: 'POST', body: all ? { all: true } : { keys } }); toast('Marked as reviewed'); viewNetwork(l.window); } catch (e) { toast(e.message); } };
  return [
    el('h3', { class: 'section-title' }, 'Firewall rule changes', el('button', { class: 'btn secondary small push', onclick: () => ack([], true) }, icon('check'), 'Mark all reviewed')),
    el('p', { class: 'sub', text: 'Rules that were added, edited or removed in OPNsense since Prxy Core last took a baseline.' }),
    el('div', { class: 'checks' }, r.changes.map((c) => el('div', { class: 'check-row amber' },
      dot('amber'), el('span', { class: 'check-area', text: c.state }),
      el('span', { class: 'check-main' }, el('b', { text: c.description || '(no description)' }), el('span', { class: 'sub mono', text: c.text })),
      el('button', { class: 'btn secondary small', onclick: () => ack([c.key]) }, 'Reviewed')))),
  ];
}

function blockedPanel(l, m) {
  const b = l.blocks;
  if (!b) return null;
  const ifName = Object.fromEntries(((l.opn && l.opn.interfaces) || []).map((i) => [i.dev, i.name]));
  const nm = (d) => ifName[d] || d || '-';
  const since = b.collectingSince ? fmtAgo(new Date(b.collectingSince * 1000).toISOString()).replace(' ago', '') : null;
  return [
    el('h3', { class: 'section-title', text: 'Blocked at the firewall' }),
    b.total === 0
      ? el('div', { class: 'alert info' }, icon('check'), l.opn ? 'Nothing blocked yet. Prxy Core records blocks from the firewall log every 30 seconds.' : 'Needs the OPNsense log privileges.')
      : [
        el('div', { class: 'grid grid-stats' },
          stat('Blocked (24 h)', fmtNum(b.total), since ? `collecting for ${since}` : ''),
          stat('Distinct sources', fmtNum(b.distinctSources), 'addresses that were blocked'),
          stat('Busiest interface', b.byIface[0] ? nm(b.byIface[0].iface) : '-', b.byIface[0] ? `${fmtNum(b.byIface[0].n)} blocks` : ''),
          stat('Main reason', b.byRule[0] ? (b.byRule[0].label || '-').replace(/ \/ state violation rule/, '').slice(0, 26) : '-', b.byRule[0] ? `${fmtNum(b.byRule[0].n)} blocks` : '')),
        el('div', { class: 'chart-grid' },
          el('div', {}, el('div', { class: 'stat-label', text: 'Top blocked destination ports' }),
            resultTable(['protocol', 'port', 'blocks', 'sources'], b.topPorts.map((x) => [x.proto, x.dport, x.n, x.sources]))),
          el('div', {}, el('div', { class: 'stat-label', text: 'Top blocked sources' }),
            resultTable(['address', 'where', 'blocks', 'ports'], b.topSources.map((x) => [x.src, x.lan ? 'inside' : 'internet', x.n, x.ports])))),
        el('div', { class: 'stat-label hint', text: 'Most recent blocks' }),
        resultTable(['time', 'interface', 'from', 'to', 'rule'], b.recent.map((x) => [new Date(x.ts * 1000).toLocaleTimeString(), nm(x.iface), x.src, `${x.dst}${x.dport ? ':' + x.dport : ''} ${x.proto || ''}`, (x.label || '').slice(0, 40)])),
        el('p', { class: 'sub hint', text: 'Blocks from the internet are normal background scanning on any connection. Blocks from an address inside your network (where = inside) are worth a look.' }),
      ],
  ];
}
const fmtBits = (m) => (m == null ? '-' : m >= 100 ? `${m.toFixed(0)} Mbps` : m >= 1 ? `${m.toFixed(1)} Mbps` : m >= 0.001 ? `${(m * 1000).toFixed(0)} kbps` : '0 kbps');

function netNode(svg, { x, y, w, h, title, lines = [], cls = '' }) {
  const g = svgEl('g', { class: `nv-node ${cls}` });
  g.appendChild(svgEl('rect', { x, y, width: w, height: h, rx: 8 }));
  const t = svgEl('text', { x: x + w / 2, y: y + 22, class: 'nv-title', 'text-anchor': 'middle' }); t.textContent = title; g.appendChild(t);
  lines.forEach((l, i) => { const s = svgEl('text', { x: x + w / 2, y: y + 42 + i * 16, class: 'nv-sub', 'text-anchor': 'middle' }); s.textContent = l; g.appendChild(s); });
  svg.appendChild(g);
}
function netChip(svg, { x, y, w, h, title, sub }) {
  const g = svgEl('g', { class: 'nv-node chip' });
  g.appendChild(svgEl('rect', { x, y, width: w, height: h, rx: 6 }));
  const t = svgEl('text', { x: x + 12, y: y + 17, class: 'nv-title' }); t.textContent = title; g.appendChild(t);
  if (sub) { const u = svgEl('text', { x: x + 12, y: y + 33, class: 'nv-sub' }); u.textContent = sub.length > 46 ? sub.slice(0, 44) + '…' : sub; g.appendChild(u); }
  svg.appendChild(g);
}
function netEdge(svg, { x1, y1, x2, y2, width = 2, dashed = false, label = null, labelDy = -6 }) {
  const mx = (x1 + x2) / 2;
  svg.appendChild(svgEl('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, class: `nv-edge${dashed ? ' dashed' : ''}`, 'stroke-width': width, fill: 'none' }));
  if (label) { const t = svgEl('text', { x: mx, y: (y1 + y2) / 2 + labelDy, class: 'nv-label', 'text-anchor': 'middle' }); t.textContent = label; svg.appendChild(t); }
}

let netFilterText = '';
async function viewNetwork(win = 300, refresh = false) {
  // refresh = a background update: no spinner, scroll position kept, page swapped in once the data is ready.
  const keepY = refresh ? window.scrollY : 0;
  const body = el('div', {}, refresh ? null : el('div', { class: 'spinner', text: 'Reading NetFlow…' }));
  const stamp = el('span', { class: 'sub', text: '' });
  const picker = el('div', { class: 'seg', role: 'group', 'aria-label': 'Window' }, [[60, '1 min'], [300, '5 min'], [900, '15 min'], [3600, '1 h']].map(([s, l]) =>
    el('button', { class: s === win ? 'active' : '', onclick: () => viewNetwork(s) }, l)));
  const mount = () => render(shell('Network', [pageHead('Network', 'Starlink → OPNsense → VLANs → switch → access points and devices. Line thickness is live traffic. Updates every 30 seconds.', stamp, picker), body]));
  if (!refresh) mount();
  try {
    const { model: m, live: l } = await api(`/netview?window=${win}`);
    const opn = l.opn && l.opn.ok ? l.opn : null;
    const uf = l.unifi && l.unifi.ok ? l.unifi : null;
    const ipName = Object.fromEntries((uf ? uf.clients : []).filter((c) => c.ip && c.name).map((c) => [c.ip, c.name]));
    const ifBy = Object.fromEntries((opn ? opn.interfaces : []).map((i) => [i.dev, i]));
    const mb = (bps) => (bps == null ? null : bps / 1e6);
    const wan = opn && opn.wan && opn.wan.rxBps != null ? { up: mb(opn.wan.txBps), down: mb(opn.wan.rxBps), ip: opn.wan.ip, speed: opn.wan.speedMbps } : null;
    const gw = opn ? (opn.gateways || []).find((g) => /starlink/i.test(g.name)) : null;
    const wg = ifBy[m.vpn.device] || null;
    const trunkIf = ifBy[m.trunk.device] || null;
    const vlanLive = (v) => {
      const i = ifBy[`vlan0.1.${v.id}`];
      return i && i.rxBps != null ? { up: mb(i.rxBps), down: mb(i.txBps), speed: i.speedMbps, status: i.status } : null;
    };
    const netUp = wan ? wan.up : l.internet.upMbps; const netDown = wan ? wan.down : l.internet.downMbps;
    const maxMbps = Math.max(1, ...l.vlans.map((v) => { const x = vlanLive(v); return x ? x.up + x.down : v.downMbps + v.localMbps; }), (netUp || 0) + (netDown || 0));
    const wd = (mb) => 2 + 12 * Math.sqrt(Math.max(0, mb) / maxMbps);
    const W = 1380; const H = 620;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'nv-svg', role: 'img', 'aria-label': 'Network diagram' });
    const cy = 300;
    const rowY = (i) => 30 + i * 150;
    const vlanById = Object.fromEntries(l.vlans.map((v) => [v.id, v]));
    const totalNet = (netUp || 0) + (netDown || 0);
    const trunkMbps = trunkIf && trunkIf.rxBps != null ? mb(trunkIf.rxBps + trunkIf.txBps) : (m.vlans.every((v) => vlanLive(v)) ? m.vlans.reduce((a, v) => a + vlanLive(v).up + vlanLive(v).down, 0) : l.vlans.reduce((a, v) => a + v.downMbps + v.localMbps, 0) + (l.internet.upMbps || 0));

    // edges first so nodes draw on top
    netEdge(svg, { x1: 120, y1: cy, x2: 145, y2: cy, width: wd(totalNet) });
    netEdge(svg, { x1: 305, y1: cy, x2: 400, y2: cy, width: wd(totalNet), label: `↑ ${netUp == null ? 'n/a' : fmtBits(netUp)}`, labelDy: -wd(totalNet) / 2 - 22 });
    { const t = svgEl('text', { x: 352, y: cy - wd(totalNet) / 2 - 8, class: 'nv-label', 'text-anchor': 'middle' }); t.textContent = `↓ ${fmtBits(netDown)}`; svg.appendChild(t); }
    netEdge(svg, { x1: 540, y1: cy, x2: 600, y2: cy, width: wd(trunkMbps), label: trunkIf && trunkIf.speedMbps ? (trunkIf.speedMbps >= 1000 ? trunkIf.speedMbps / 1000 + ' Gbps' : trunkIf.speedMbps + ' Mbps') : m.trunk.device, labelDy: -wd(trunkMbps) / 2 - 8 });
    netEdge(svg, { x1: 470, y1: cy + 70, x2: 470, y2: 450, width: 3, dashed: true });
    { const t = svgEl('text', { x: 482, y: 420, class: 'nv-label' }); t.textContent = 'Guest egress'; svg.appendChild(t); }
    m.vlans.forEach((v, i) => {
      const lv = vlanById[v.id]; const vx = vlanLive(v); const edgeMbps = vx ? vx.up + vx.down : (lv ? lv.downMbps + lv.localMbps : 0);
      netEdge(svg, { x1: 740, y1: cy, x2: 800, y2: rowY(i) + 60, width: wd(edgeMbps) });
      netEdge(svg, { x1: 1020, y1: rowY(i) + 60, x2: 1070, y2: rowY(i) + 25, width: 2 });
    });

    netNode(svg, { x: 10, y: cy - 36, w: 110, h: 72, title: 'Internet', lines: ['cloud'], cls: 'cloud' });
    netNode(svg, { x: 145, y: cy - 50, w: 160, h: 100, title: m.wan.name, lines: wan ? [`WAN · ${m.wan.device}${wan.speed ? ' · ' + wan.speed / 1000 + ' Gbps' : ''}`, wan.ip || '', gw && gw.delay && gw.delay !== '~' ? `${gw.delay} · ${gw.loss} loss` : 'shared (CGNAT) address'] : [`WAN · ${m.wan.device}`, 'carrier NAT?'], cls: 'wan' });
    netNode(svg, { x: 400, y: cy - 70, w: 140, h: 140, title: 'OPNsense', lines: ['firewall / router', `WAN ${m.wan.device}`, `trunk ${m.trunk.device}`, 'Suricata IPS'], cls: 'fw' });
    netNode(svg, { x: 400, y: 450, w: 140, h: 92, title: m.vpn.name, lines: wg && wg.rxBps != null ? [`${m.vpn.device} · ${wg.ip || ''}`, `↑ ${fmtBits(mb(wg.txBps))}  ↓ ${fmtBits(mb(wg.rxBps))}`, 'Guest internet'] : [`${m.vpn.device} WireGuard`, 'Guest only'], cls: 'vpn' });
    netNode(svg, { x: 600, y: cy - 60, w: 140, h: 120, title: 'Switch', lines: [m.switches[0], `+ ${m.switches[1]}`, 'tagged VLANs'], cls: 'sw' });

    m.vlans.forEach((v, i) => {
      const lv = vlanById[v.id] || {};
      const top = (lv.top && lv.top[0]) ? `top: ${(ipName[lv.top[0].ip] || lv.top[0].ip.split('.').slice(2).join('.')).slice(0, 16)} ${fmtBits(lv.top[0].mbps)}` : 'quiet';
      const vx = vlanLive(v);
      netNode(svg, { x: 800, y: rowY(i), w: 220, h: 120, title: `${v.name} · VLAN ${v.id}`,
        lines: vx
          ? [v.subnet, `↑ ${fmtBits(vx.up)}  ↓ ${fmtBits(vx.down)}`, `${lv.hosts || 0} active hosts · ${vx.speed ? vx.speed / 1000 + ' Gbps link' : 'link up'}`, top]
          : [v.subnet, `↓ ${fmtBits(lv.downMbps)} from internet`, `${lv.hosts || 0} active hosts · LAN ${fmtBits(lv.localMbps)}`, top], cls: `vlan v${v.id}` });
      // endpoints for this VLAN
      let chips;
      if (uf) {
        const mine = uf.clients.filter((c) => c.vlan === v.id);
        const bySsid = {};
        mine.filter((c) => !c.wired).forEach((c) => { const k = c.ssid || '?'; (bySsid[k] = bySsid[k] || { n: 0, aps: new Set() }).n++; if (c.apName) bySsid[k].aps.add(c.apName); });
        const wired = mine.filter((c) => c.wired);
        chips = [...Object.entries(bySsid).sort((a, b) => b[1].n - a[1].n).map(([ssid, x]) => ({ t: `Wi-Fi "${ssid}"`, s: `${x.n} devices now · ${[...x.aps].join(', ')}` })),
          ...(wired.length ? [{ t: `Wired · ${wired.length} device${wired.length > 1 ? 's' : ''}`, s: wired.slice(0, 3).map((c) => c.name || c.oui || c.mac).join(', ') }] : [])];
      } else {
        const ssids = l.wifi.ssids.filter((s) => s.vlan === v.id);
        chips = [...ssids.map((s) => ({ t: `Wi-Fi "${s.ssid}"`, s: `${s.clients} devices (6 h) · ${s.aps.join(', ')}` })), ...((m.wired[v.id] || []).map((w) => ({ t: w.name, s: w.detail })))];
      }
      if (!chips.length) chips.push({ t: 'No devices seen', s: '' });
      chips.slice(0, 2).forEach((c, k) => netChip(svg, { x: 1070, y: rowY(i) + k * 60, w: 300, h: 50, title: c.t, sub: c.s }));
    });

    const other = uf ? [] : l.wifi.ssids.filter((s) => !m.vlans.some((v) => v.id === s.vlan));
    const untagged = uf ? uf.clients.filter((c) => c.vlan == null && c.network) : [];
    fill(body,
      el('div', { class: 'grid grid-stats' },
        wan ? stat('Starlink (live)', `↓ ${fmtBits(wan.down)}`, `↑ ${fmtBits(wan.up)} · router counters, 15 s`) : stat('Internet', `↓ ${fmtBits(l.internet.downMbps)}`, `↑ ${l.internet.upMbps == null ? 'n/a' : fmtBits(l.internet.upMbps)} · NetFlow average over ${win >= 3600 ? '1 h' : win / 60 + ' min'}`),
        gw && gw.delay && gw.delay !== '~' ? stat('Starlink latency', gw.delay, `${gw.loss} loss · ${gw.status_translated || gw.status}`) : stat('Busiest VLAN', (() => { const b = [...l.vlans].sort((a, c) => c.downMbps - a.downMbps)[0]; return b && b.downMbps > 0 ? b.name : '-'; })(), 'by download'),
        uf ? stat('Wi-Fi devices now', String(uf.clients.filter((c) => !c.wired).length), uf.devices.filter((d) => d.type === 'uap').map((a) => `${a.name} ${a.clients ?? 0}`).join(' · ')) : stat('Wi-Fi devices (6 h)', String(l.wifi.aps.reduce((a, x) => a + x.clients, 0)), l.wifi.aps.map((a) => `${a.name} ${a.clients}`).join(' · ')),
        stat('OPNsense', opn ? 'Connected' : 'Export only', opn ? `${opn.interfaces.length} interfaces · read-only API` : `rules from ${m.exportedOn}`)),
      el('div', { class: 'nv-wrap' }, svg),
      untagged.length ? el('div', { class: 'alert warn' }, icon('alert'), el('span', { text: `${untagged.length} device${untagged.length > 1 ? 's are' : ' is'} on the untagged "${untagged[0].network}" network (${[...new Set(untagged.map((c) => c.ssid || 'wired'))].join(', ')}): ${untagged.slice(0, 4).map((c) => c.name || c.oui || c.mac).join(', ')}. That network has no firewall interface, so its traffic will not get through.` })) : null,
      other.length ? el('div', { class: 'alert warn' }, icon('alert'), el('span', { text: `Wi-Fi networks outside the four VLANs: ${other.map((s) => `"${s.ssid}" (${s.network || 'untagged'}, ${s.clients} devices)`).join('; ')}. Traffic on an untagged network has no firewall rules and will not get through.` })) : null,
      unifiPanels(uf),
      l.between.length ? [el('h3', { class: 'section-title', text: 'Traffic between VLANs' }),
        resultTable(['from', 'to', 'rate'], l.between.slice(0, 8).map((b) => [(m.vlans.find((v) => v.id === b.from) || { name: `10.20.${b.from}.x` }).name, (m.vlans.find((v) => v.id === b.to) || { name: `10.20.${b.to}.x` }).name, fmtBits(b.mbps)]))] : null,

      shadowBanner(l.rules),
      ruleChangeBanner(l, m),
      blockedPanel(l, m),

      el('h3', { class: 'section-title', text: 'What each network may reach' }),
      el('div', { class: 'table-wrap' }, el('table', { class: 'data policy' },
        el('thead', {}, el('tr', {}, el('th', { text: 'From ↓  /  To →' }), m.policyColumns.map((c) => el('th', { text: c })))),
        el('tbody', {}, Object.entries(m.policy).map(([from, row]) => el('tr', {}, el('td', {}, el('b', { text: from })),
          m.policyColumns.map((to) => { const v = row[to]; const note = m.policyNotes[`${from}>${to}`];
            return el('td', { title: note || null }, el('span', { class: `badge ${v === 'allow' ? (note ? 'warn' : 'ok') : v === 'block' ? 'bad' : 'warn'}`, text: v === 'allow' ? 'allow' : v === 'block' ? 'block' : 'limited' })); })))))),
      el('p', { class: 'sub hint', text: 'Upload is only measurable for the whole router: OPNsense reports outbound traffic after NAT, so it cannot be split by VLAN. Downloads are per VLAN.' }),
      el('p', { class: 'sub hint', text: `Read from your OPNsense export of ${m.exportedOn}. Amber "allow" cells are not what the rules were meant to do - see the findings below. Hover a cell for the reason.` }),

      el('h3', { class: 'section-title', text: 'Firewall findings' }),
      el('div', { class: 'checks' }, m.findings.map((f, i) => el('div', { class: `check-row ${f.level === 'green' ? 'ok' : f.level}`, role: 'group' },
        dot(f.level === 'amber' ? 'amber' : f.level === 'green' ? 'green' : 'gray'),
        el('span', { class: 'check-area', text: f.level === 'amber' ? `Finding ${i + 1}` : f.level === 'green' ? 'Good' : 'Note' }),
        el('span', { class: 'check-main' }, el('b', { text: f.title }), el('span', { class: 'sub', text: f.detail })),
        null))));
    stamp.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    if (refresh) { mount(); window.scrollTo(0, keepY); }
    autoRefresh(() => viewNetwork(win, true), 30000);
  } catch (e) {
    if (!refresh) fill(body, errorBox(e));
    else { stamp.textContent = 'Update failed - retrying'; autoRefresh(() => viewNetwork(win, true), 30000); }
  }
}

// ---------- Guide ----------
const EXAMPLES = {
  sizes: { db: 'postgres', sql: "SELECT datname AS database,\n       pg_size_pretty(pg_database_size(datname)) AS size\n  FROM pg_database\n WHERE NOT datistemplate\n ORDER BY pg_database_size(datname) DESC" },
  tables: { db: 'autotrack', sql: "SELECT table_name\n  FROM information_schema.tables\n WHERE table_schema = 'public'\n ORDER BY table_name" },
  users: { db: 'autotrack', sql: "SELECT id, email, created_at\n  FROM users\n ORDER BY created_at DESC\n LIMIT 10" },
  logins: { db: 'autotrack', sql: "SELECT date_trunc('day', attempted_at) AS day, count(*) AS attempts\n  FROM login_attempts\n GROUP BY 1\n ORDER BY 1 DESC" },
};

function tryIt(key, label) {
  const ex = EXAMPLES[key];
  return el('div', { class: 'example' },
    el('pre', { class: 'example-sql', text: ex.sql }),
    el('div', { class: 'example-foot' },
      el('span', { class: 'db-tag', text: `database: ${ex.db}` }),
      el('button', { class: 'btn small', onclick: () => {
        try { sessionStorage.setItem('prxy.sql', ex.sql); } catch { /* ignore */ }
        location.hash = `#/query?db=${enc(ex.db)}`;
      } }, icon('play'), label || 'Try it')));
}

function viewGuide() {
  const sec = (id, title, ...body) => el('section', { class: 'guide-section card', id: `g-${id}` }, el('h2', { text: title }), ...body);
  const p = (...t) => el('p', {}, ...t);
  const b = (t) => el('b', { text: t });
  const c = (t) => el('code', { text: t });
  const step = (n, title, ...body) => el('div', { class: 'step' }, el('div', { class: 'step-num', text: String(n) }),
    el('div', { class: 'step-body' }, el('h3', { text: title }), ...body));
  const toc = [['what', 'What is Prxy Core'], ['safe', 'How it keeps data safe'], ['infra', 'Infrastructure pages'], ['act', 'Actions, backups & power'], ['tour', 'Tutorial'], ['sql', 'SQL cheat sheet'],
    ['faq', 'Troubleshooting'], ['next', "What's coming"]];

  render(shell('Guide', [
    el('div', { class: 'page-head' }, el('div', {}, el('h1', { text: 'Guide' }),
      el('p', { class: 'sub', text: 'What this app does and a 10-minute hands-on tour' }))),
    el('div', { class: 'guide' },
      el('nav', { class: 'guide-toc card' }, el('div', { class: 'stat-label', text: 'On this page' }),
        toc.map(([id, t]) => el('a', { href: `#/guide`, onclick: (e) => { e.preventDefault(); document.getElementById(`g-${id}`).scrollIntoView({ behavior: 'smooth' }); } }, t))),
      el('div', { class: 'guide-body' },
        sec('what', 'What is Prxy Core',
          p('Prxy Core is your homelab control center, a single place to see what is going on across your servers without SSH-ing into each one. It runs in its own container (LXC 136) and looks and feels like AutoTrack.'),
          p('It watches the whole lab: the Proxmox host and its 29 LXCs/VMs, the Docker containers on mgmt-docker, the monitoring stack (Prometheus, Alertmanager, Loki) and every web UI. The ', b('Overview'), ' page rolls all of that into one list of problems, worst first.'),
          p('It also covers your ', b('databases'), '. Every app in the lab (AutoTrack, Wiki.js, Nextcloud, the homelab metrics) stores its data in one PostgreSQL server at 10.20.40.111. Prxy Core lets you:'),
          el('ul', {},
            el('li', {}, b('See every database at a glance'), ': size, connections, cache health and size growth over time.'),
            el('li', {}, b('Browse tables'), ' like a spreadsheet: page, sort, inspect columns and indexes, export to CSV.'),
            el('li', {}, b('Ask questions with SQL'), ' in the query console, and save the ones you use often.'),
            el('li', {}, b('Watch server health'), ': who is connected, slow queries, blocked locks.'),
            el('li', {}, b('Review the audit log'), ': every sign-in and query is recorded.'))),

        sec('safe', 'How it keeps data safe',
          el('div', { class: 'alert info' }, icon('lock'), el('span', { text: 'Short version: Prxy Core can look, but it cannot touch. Nothing you do here can change or delete data in your apps.' })),
          el('ul', {},
            el('li', {}, b('Read-only database user. '), 'It connects as ', c('viewer'), ', a Postgres role that can read everything and write nothing. Postgres itself rejects any change.'),
            el('li', {}, b('Read-only transactions. '), 'As a second lock, every query runs inside ', c('BEGIN READ ONLY'), ' and is rolled back afterwards.'),
            el('li', {}, b('Guard rails. '), 'One statement at a time, a 15-second timeout, and at most 500 rows returned, so a runaway query cannot slow down your apps.'),
            el('li', {}, b('Secrets are masked. '), 'Columns that look like passwords, tokens, hashes or keys show as ', el('span', { class: 'masked-demo', text: '••••••' }), '. You can reveal them, but each reveal is written to the audit log.'),
            el('li', {}, b('Two-factor sign-in. '), 'Password plus a 6-digit code from your authenticator app. Sessions expire after 12 hours.'))),

        sec('infra', 'Infrastructure pages',
          p('Colored dots mean the same thing everywhere: ', dot('green'), ' healthy, ', dot('amber'), ' warning, ', dot('red'), ' needs attention, ', dot('gray'), ' stopped on purpose or no data.'),
          el('ul', {},
            el('li', {}, b('Overview'), ': the status board. Every finding links to the page that explains it. It refreshes itself every minute. Checks include stopped guests, disks over 80%/92%, missing backups, stopped containers, failed scrapes, firing alerts, log feeds that went quiet and web UIs that stopped answering.'),
            el('li', {}, b('Infrastructure'), ': the Proxmox host, storage pools and every guest with CPU, memory, disk, uptime, backup status and a link to its web UI. Click a row for 1h-7d charts and the exact restart command for that service.'),
            el('li', {}, b('Docker'), ': the containers on mgmt-docker with live CPU, memory and network, plus top-6 trend charts. "Known noise" marks containers whose log warnings are harmless.'),
            el('li', {}, b('Monitoring'), ': firing alerts, silences, Prometheus scrape targets and the health of each Loki log feed.'),
            el('li', {}, b('Network'), ': a live map of Starlink → OPNsense → switch → your four VLANs → Wi-Fi networks and wired devices, with line thickness showing traffic. Below the map: each switch as a port panel (what is plugged into every port, speed, PoE, traffic), each access point (radios, busy time, retries), and a searchable list of every connected device with its signal and rate. Rates come straight from the firewall\'s own interface counters (read-only account), plus Starlink latency and loss. Below it: what each network is allowed to reach and a list of firewall findings. The rules come from your OPNsense export, so re-export and tell me when you change the firewall.'),
            el('li', {}, b('Security'), ': a list of Wi-Fi devices with new ones flagged for review (the first run takes a baseline of everything already on your network), failed AutoTrack logins by address and account, and whether Suricata alerts are reaching the log server. The Overview flags new devices and bursts of failed logins.'),
            el('li', {}, b('Recon'), ': paste an IP address, domain, email, URL, file hash, username or MAC address. It first checks your own network (firewall blocks from the last 24 hours, VLAN, Proxmox guest, known device), then public records for outside addresses and domains: reverse DNS, the network owner, registration (RDAP), DNS, mail security (SPF/DMARC) and certificates (crt.sh), with links to deeper outside tools. Internal addresses are never sent out. Nothing is saved: results stay in memory for 10 minutes and the Audit page only notes the type of lookup. Homepage\u2019s lookup box opens it too. Your own public internet address is labelled as such. ' +
              '"Explain in plain English" asks your local Ollama model (phi4 on the RTX 3060) to summarise the results - nothing leaves the lab. For outside IP addresses a "Block it in OPNsense" card gives copy-ready alias entries and the steps; you make the change in OPNsense yourself. ' +
              'The Exposure tab checks your own domains daily (SPF, DMARC, expiry, names in public certificate logs - domain facts only), links out to check your own email or username without saving it, and keeps a data-broker opt-out checklist whose ticks are stored only in your browser.'),
            el('li', {}, b('Logs'), ': search Loki. Pick a feed (netflow, unifi_siem, suricata), optionally type text such as an IP, and search. NetFlow lines are summarized as "proto source → destination · bytes"; click a line to see the full record.')),
          el('div', { class: 'alert info' }, icon('lock'), el('span', { text: 'Viewing these pages never changes anything. Prxy Core reads Prometheus, Alertmanager and Loki, and only checks whether web UIs answer. Changes happen only through the action buttons described next.' }))),

        sec('act', 'Actions, backups & power',
          p('A few buttons do change things. Every one of them asks for a ', b('fresh 6-digit authenticator code'), ' (each code works once), and shutdown/reboot also make you type the guest’s name. Every action is written to the Audit log.'),
          el('ul', {},
            el('li', {}, b('Start / Reboot / Shut down'), ' on a guest’s page (Infrastructure → click a guest). Prxy Core uses its own Proxmox token, which can only power guests on/off and run backups. It cannot create, delete or reconfigure anything, and it refuses to power-cycle its own container.'),
            el('li', {}, b('Back up now'), ' on a guest page or the ', el('a', { href: '#/backups', text: 'Backups' }), ' page takes a snapshot backup while the guest keeps running.'),
            el('li', {}, b('Individual services and containers'), ' are deliberately read-only. Each guest page lists its services with the exact command to run yourself, for example systemctl restart grafana-server.')),
          p(el('a', { href: '#/backups', text: 'Backups' }), ' shows when each guest was last backed up (green = within 26 h), the nightly job (02:30, keeps the last 3), storage use and recent runs. Backups sit on the same disk as the guests, so they protect against mistakes, not against that disk dying. An off-disk copy is the next step.'),
          p(el('a', { href: '#/power', text: 'Power' }), ' shows the UPS: battery, load, input and estimated runtime. The Overview turns red the moment the lab runs on battery, and amber if the UPS stops reporting.')),

        sec('tour', 'Tutorial',
          p('Work through these in order. Each step takes a minute or two.'),
          step(1, 'Read the Databases page',
            p('Open ', el('a', { href: '#/databases', text: 'Databases' }), '. The top row is the server as a whole. ', b('Connections'), ' shows how close you are to the limit of 100, and ', b('Waiting locks'), ' should normally be 0.'),
            p('Each card below is one database. ', b('Cache hit'), ' near 100% means Postgres is answering from memory (good). The small chart fills in hourly and shows size growth over 30 days. A card marked ', el('span', { class: 'badge warn', text: 'no access' }), ' means that database blocks the viewer role. See Troubleshooting.')),
          step(2, 'Browse a table',
            p('Click the ', b('autotrack'), ' card, then the ', b('users'), ' table. You are looking at real rows. Click a column header to sort, and use Prev and Next to page through.'),
            p('Notice ', c('password_hash'), ' is masked. Switch to the ', b('Structure'), ' tab to see each column’s type, the indexes and the foreign keys (how tables link to each other).')),
          step(3, 'Run your first query',
            p('SQL is just a structured question. This one asks "how big is each database?". Press ', b('Try it'), ' to load it into the console, then press ', b('Run'), ' (or Ctrl+Enter).'),
            tryIt('sizes')),
          step(4, 'Ask about one app',
            p('List the tables inside AutoTrack:'), tryIt('tables'),
            p('Then look at the 10 newest AutoTrack accounts:'), tryIt('users')),
          step(5, 'Save a query you will reuse',
            p('Load this one, which counts sign-in attempts per day. It is handy for spotting someone guessing passwords. Run it, then press ', b('Save'), ' and name it "Logins per day". It now appears in the Saved queries panel for one-click reuse.'),
            tryIt('logins')),
          step(6, 'Try to break something (you can’t)',
            p('In the console, run ', c('DELETE FROM users'), '. You will get ', c('cannot execute DELETE in a read-only transaction'), '. That is the safety net working, and nothing was touched.')),
          step(7, 'Check the whole lab',
            p('Open ', el('a', { href: '#/', text: 'Overview' }), '. Anything red is a real problem. Click it to jump to the details. Then open ', el('a', { href: '#/infra', text: 'Infrastructure' }), ', type "pg" in the filter and click ', b('pg-postgres'), ' to see its charts.')),
          step(8, 'Follow your network traffic',
            p('Open ', el('a', { href: '#/logs', text: 'Logs' }), ' with the netflow feed selected. Type one of your device IPs into "Line contains" and press Search to see every connection that device made in the last hour.')),
          step(9, 'Check Health and the Audit log',
            p('Open ', el('a', { href: '#/health', text: 'Health' }), ' to see which apps are connected and whether anything is slow. Then open ', el('a', { href: '#/audit', text: 'Audit log' }), ': every query you just ran is listed, including the failed DELETE.'))),

        sec('sql', 'SQL cheat sheet',
          resultTable(['You want to…', 'Write'], [
            ['See some rows', 'SELECT * FROM vehicles LIMIT 20'],
            ['Pick columns', 'SELECT email, created_at FROM users'],
            ['Filter', "SELECT * FROM users WHERE email LIKE '%@gmail.com'"],
            ['Sort', 'SELECT * FROM users ORDER BY created_at DESC'],
            ['Count', 'SELECT count(*) FROM maintenance_records'],
            ['Count per group', 'SELECT vehicle_id, count(*) FROM maintenance_records GROUP BY vehicle_id'],
            ['Join two tables', 'SELECT v.*, u.email FROM vehicles v JOIN users u ON u.id = v.user_id'],
            ['Recent only', "SELECT * FROM login_attempts WHERE attempted_at > now() - interval '24 hours'"],
          ])),

        sec('faq', 'Troubleshooting',
          el('dl', { class: 'faq' },
            el('dt', { text: 'A database says "no access" (nextcloud).' }),
            el('dd', {}, 'Nextcloud removes the default CONNECT permission. To allow read-only browsing, run on the Postgres server: ', c('GRANT CONNECT ON DATABASE nextcloud TO viewer;'), '. It is still read-only.'),
            el('dt', { text: 'My query says "relation does not exist".' }),
            el('dd', {}, 'Check that the right database is selected in the dropdown. Tables live inside one database. Some apps use other schemas, so write ', c('schema.table'), '.'),
            el('dt', { text: '"canceling statement due to statement timeout"' }),
            el('dd', {}, 'The query took over 15 seconds. Add a ', c('WHERE'), ' filter or a ', c('LIMIT'), '.'),
            el('dt', { text: 'Results say "truncated at 500 rows".' }),
            el('dd', {}, 'Only the first 500 rows are returned. Narrow the query, or use the table browser’s paging for longer scans.'),
            el('dt', { text: 'My authenticator code is rejected.' }),
            el('dd', {}, 'The phone’s clock must be accurate (set it to automatic time). Codes change every 30 seconds.'),
            el('dt', { text: 'I lost my phone / 2FA.' }),
            el('dd', {}, 'On LXC 136: stop the service, delete the user row from /var/lib/prxy-core/prxy-core.db, start the service, then use the new setup token from ', c('journalctl -u prxy-core'), '.'),
            el('dt', { text: 'The browser warns about the certificate.' }),
            el('dd', {}, 'Prxy Core uses a self-signed certificate on the LAN. It is safe to accept for 10.20.40.136.'))),

        sec('next', "What's coming",
          el('ul', {},
            el('li', {}, b('Network, next steps'), '. Getting Suricata alerts flowing (needs a look at OPNsense), and live OPNsense/UniFi/Starlink data once read-only access exists: switch ports, per-device traffic, dish health.'),
            el('li', {}, b('Discord alerts'), '. Overview problems pushed to Discord.'),
            el('li', {}, b('Dashboards'), '. Your four Grafana dashboards rebuilt natively in Prxy Core: network observability, WiFi, Docker and capacity.'),
            el('li', {}, b('Phase 3: Security'), '. Credentials vault page, rotation checklist, certificate expiry, NextDNS stats.'),
            el('li', {}, b('Phase 4: AutoTrack admin'), '. Users, sign-in activity and app health in one view.'),
            el('li', {}, b('Phase 5: Ask in plain English'), '. Type a question and the local Ollama model writes the SQL for you.')))))]));
}

// ---------- Dashboards (replaces the Grafana boards; numbers first) ----------
const DASH_TABS = [['traffic', 'Network traffic'], ['wifi', 'Wi-Fi and clients'], ['docker', 'Docker health'], ['capacity', 'Capacity']];
const DASH_FMT = {
  bytes: (v) => fmtBytes(v), rate: (v) => fmtRate(v), num: (v) => fmtNum(Math.round(v)),
  pct: (v) => `${v.toFixed(v < 10 ? 1 : 0)}%`, frac: (v) => fmtPct(v), dur: (v) => fmtDur(v), dbm: (v) => `${Math.round(v)} dBm`,
};
const dashFmt = (fmt, v) => (v == null || Number.isNaN(v) ? '-' : (DASH_FMT[fmt] || ((x) => String(x)))(v));

function dashPanel(p) {
  if (p.kind === 'stats') return el('div', { class: 'grid grid-stats' }, p.items.map((i) => stat(i.label, dashFmt(i.fmt, i.value), i.note || '')));
  if (p.kind === 'chart') {
    const has = p.series.some((x) => x.values.length > 1);
    return el('div', { class: 'card' }, el('div', { class: 'stat-label', text: p.title }),
      has ? lineChart(p.series.filter((x) => x.values.length).slice(0, 8), { fmt: (v) => dashFmt(p.fmt, v), min0: p.min0 !== false }) : el('div', { class: 'empty', text: 'No data in this range.' }));
  }
  if (p.kind === 'rank') {
    const max = Math.max(1, ...p.rows.map((r) => r.value));
    return el('div', { class: 'card' }, el('div', { class: 'stat-label', text: p.title }),
      p.rows.length ? el('table', { class: 'data rank' }, el('tbody', {}, p.rows.map((r) => el('tr', {},
        el('td', { class: 'rank-label', title: r.sub ? `${r.label} - ${r.sub}` : r.label }, r.label, r.sub ? el('span', { class: 'sub', text: ` ${r.sub}` }) : null),
        el('td', { class: 'num', text: dashFmt(p.fmt, r.value) }),
        el('td', { class: 'rank-bar' }, meter(r.value / max, { warn: 2, crit: 2 })))))) : el('div', { class: 'empty', text: 'No data in this range.' }));
  }
  if (p.kind === 'table') {
    const cols = p.columns;
    return el('div', { class: 'wide-panel' }, el('h3', { class: 'section-title', text: `${p.title} (${p.rows.length})` }),
      el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, cols.map((c) => el('th', { class: c.fmt ? 'num' : '', text: c.label })))),
        el('tbody', {}, p.rows.length ? p.rows.map((r) => el('tr', {}, cols.map((c) => {
          const v = r[c.key];
          if (c.fmt === 'frac' && v != null) return el('td', {}, meter(v, { warn: 0.8, crit: 0.92 }));
          if (c.key === 'state') return el('td', {}, el('span', { class: `badge ${v === 'running' ? 'ok' : 'warn'}`, text: v }));
          return el('td', { class: c.fmt ? 'num' : '', title: c.fmt ? null : String(v ?? ''), text: c.fmt ? dashFmt(c.fmt, v) : String(v ?? '') });
        }))) : el('tr', {}, el('td', { colspan: cols.length, class: 'empty', text: 'No rows.' }))))));
  }
  if (p.kind === 'logs') {
    return el('div', { class: 'wide-panel' }, el('h3', { class: 'section-title', text: `${p.title} (${p.lines.length})` }),
      p.lines.length ? el('div', { class: 'log-list short' }, p.lines.map((l) => el('div', { class: 'log-line', title: 'Click to expand', onclick: (e) => toggleLine(e.currentTarget) },
        el('span', { class: 'log-ts', text: new Date(l.ts).toLocaleString() }),
        el('span', { class: 'log-text', 'data-full': prettyLine(l.line), text: summarizeLine(l.line) })))) : el('div', { class: 'empty', text: 'No lines in this range.' }));
  }
  return null;
}

// Cards go in a responsive grid; wide panels (tables, logs) break out to full width.
function dashLayout(panels) {
  const out = []; let grid = null;
  for (const p of panels) {
    const node = dashPanel(p);
    if (!node) continue;
    if (p.kind === 'stats' || p.kind === 'table' || p.kind === 'logs') { grid = null; out.push(node); continue; }
    if (!grid) { grid = el('div', { class: 'chart-grid dash-grid' }); out.push(grid); }
    grid.appendChild(node);
  }
  return out;
}

async function viewDashboards(tab = 'traffic', range = '24h', ip = '') {
  if (tab !== 'device' && !DASH_TABS.some(([k]) => k === tab)) tab = 'traffic';
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading dashboard…' }));
  const go = (t, r, i) => { location.hash = `#/dashboards/${t}?range=${r}${i ? `&ip=${encodeURIComponent(i)}` : ''}`; };
  const ipBox = el('input', { type: 'text', class: 'mono', placeholder: 'Device IP, e.g. 10.20.20.15', value: ip, 'aria-label': 'Device IP' });
  ipBox.addEventListener('keydown', (e) => { if (e.key === 'Enter' && ipBox.value.trim()) go('device', range, ipBox.value.trim()); });
  const tabs = el('div', { class: 'tabs' }, DASH_TABS.map(([k, label]) => el('button', { class: k === tab ? 'active' : '', onclick: () => go(k, range) }, label)),
    el('button', { class: tab === 'device' ? 'active' : '', onclick: () => ipBox.focus() }, 'One device'));
  render(shell('Dashboards', [pageHead('Dashboards', 'The four Grafana boards, rebuilt around numbers and logs', rangePicker(range, (r) => go(tab, r, ip))), tabs,
    tab === 'device' || tab === 'traffic' ? el('div', { class: 'toolbar' }, ipBox, el('button', { class: 'btn secondary small', onclick: () => ipBox.value.trim() && go('device', range, ipBox.value.trim()) }, icon('eye'), 'Show this device')) : null,
    body]));
  const load = async (quiet) => {
    try {
      const d = await api(`/dashboards/${tab}?range=${range}${tab === 'device' ? `&ip=${encodeURIComponent(ip)}` : ''}`);
      fill(body, d.notice ? el('div', { class: 'alert warn' }, icon('alert'), d.notice) : null, dashLayout(d.panels),
        el('p', { class: 'sub hint', text: `Updated ${new Date(d.generatedAt || Date.now()).toLocaleTimeString()} - refreshes every minute.` }));
    } catch (e) { if (!quiet) fill(body, errorBox(e)); }
  };
  if (tab === 'device' && !ip) { fill(body, el('div', { class: 'empty', text: 'Type a device IP above to see where its traffic goes.' })); return; }
  await load(false);
  autoRefresh(() => load(true), 60000);
}

// ---------- router ----------
const RANGE_KEYS = ['1h', '6h', '24h', '7d'];
// ---------- recon ----------
// "Who is this IP / domain / email?" - the lab's own data first, then public records. Nothing is stored: the server keeps
// results in memory for 10 minutes and the audit log records only the type of lookup.
function kvTable(rows) {
  const shown = rows.filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
  if (!shown.length) return el('p', { class: 'sub', text: 'Nothing found.' });
  return el('table', { class: 'kvtable' }, el('tbody', {}, shown.map(([k, v]) => el('tr', {},
    el('th', { text: k }), el('td', {}, Array.isArray(v) ? v.map((x) => el('div', { class: 'mono', text: x })) : (v instanceof Node ? v : el('span', { text: String(v) })))))));
}
const reconDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : null);
const RECON_LABEL = { ip: 'IP address', domain: 'Domain', email: 'Email address', url: 'Web address', hash: 'File hash', username: 'Username', mac: 'MAC address' };

async function viewRecon(q) {
  const input = el('input', { class: 'grow mono', type: 'search', value: q, placeholder: 'IP, domain, email, URL, file hash, username or MAC', 'aria-label': 'Indicator to look up', autocomplete: 'off', spellcheck: 'false' });
  const go = () => { const v = input.value.trim(); if (v) location.hash = '#/recon?q=' + encodeURIComponent(v); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  const form = el('div', { class: 'toolbar' }, input, el('button', { class: 'btn', onclick: go }, icon('eye'), 'Look up'));
  const body = el('div', {});
  render(shell('Recon', [pageHead('Recon', 'Who is this address, domain or account? Your own network first, then public records'), el('div', { class: 'toolbar' }, reconTabs('Look up')), form, body]));
  if (!q) {
    fill(body, el('div', { class: 'alert info' }, icon('eye'), el('div', {},
      el('b', { text: 'Your network first. ' }), 'Firewall blocks from the last 24 hours, VLAN, guest and device. ',
      el('b', { text: 'Then public records' }), ' for outside addresses and domains: reverse DNS, network owner, registration, DNS, mail security and certificates. ',
      'Internal addresses are never sent to outside services. Results are not saved; the audit log only notes the type of lookup.')));
    input.focus();
    return;
  }
  fill(body, el('div', { class: 'spinner', text: 'Looking up…' }));
  let r;
  try { r = await api('/recon?q=' + encodeURIComponent(q)); } catch (e) { fill(body, errorBox(e)); return; }
  if (!r.type) { fill(body, el('div', { class: 'alert error' }, icon('alert'), 'Not recognised. Try a full IP, domain, email address, URL (with https://), MD5/SHA-1/SHA-256 hash, username or MAC address.')); return; }

  const head = el('div', { class: 'toolbar' },
    el('span', { class: 'badge' }, RECON_LABEL[r.type] || r.type),
    r.internal ? el('span', { class: 'badge ok', text: 'inside your network' }) : r.ownPublic ? el('span', { class: 'badge ok', text: 'your own public internet address' }) : el('span', { class: 'badge warn', text: 'outside address' }),
    r.cached ? el('span', { class: 'sub', text: 'from the last 10 minutes' }) : null,
    el('span', { class: 'grow' }), el('span', { class: 'mono', text: r.query }));

  // Your network
  const L = r.local; const fw = L && L.firewall;
  const ago = (sec) => (sec ? fmtAgo(new Date(sec * 1000).toISOString()) : '-');
  const local = L ? [
    el('h3', { class: 'section-title', text: 'Your network' }),
    fw ? el('div', { class: 'grid grid-stats' },
      stat('Firewall blocks (24 h)', fmtNum(fw.blocks), fw.blocks ? `${fmtNum(fw.asSource)} from it, ${fmtNum(fw.asTarget)} to it` : 'none in the last 24 hours'),
      fw.blocks ? stat('First / last block', ago(fw.last), `first ${ago(fw.first)}`) : null,
      L.vlan ? stat('VLAN', L.vlan.split(' (')[0], L.vlan.replace(/^[^(]*\(|\)$/g, '')) : null,
      L.guest ? stat('Proxmox guest', L.guest.name, `${L.guest.vmid} · ${L.guest.role}`) : null) : null,
    L.device ? el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'Known device' }), kvTable([
      ['Name', L.device.name], ['Status', L.device.known ? 'known' : 'new - not yet reviewed'], ['Address', L.device.ip], ['Connection', L.device.kind === 'wifi' ? `Wi-Fi ${L.device.ssid || ''}` : 'wired'],
      ['Network', L.device.network], ['Access point', L.device.ap], ['First seen', ago(L.device.first_seen)], ['Last seen', ago(L.device.last_seen)]])) : null,
    fw && fw.blocks ? el('div', { class: 'chart-grid' },
      el('div', {}, el('div', { class: 'stat-label', text: 'Blocked ports' }), resultTable(['protocol', 'port', 'blocks'], (fw.ports || []).map((x) => [x.proto, x.dport, x.n]))),
      el('div', {}, el('div', { class: 'stat-label', text: 'Which rule blocked it' }), resultTable(['rule', 'blocks'], (fw.rules || []).map((x) => [x.label || '(unnamed)', x.n]))),
      el('div', { class: 'wide' }, el('div', { class: 'stat-label', text: 'Latest blocks' }),
        resultTable(['time', 'interface', 'from', 'to', 'port', 'protocol'], (fw.recent || []).map((x) => [new Date(x.ts * 1000).toLocaleString(), x.iface, x.src, x.dst, x.dport, x.proto])))) : null,
    !fw && !L.device ? el('p', { class: 'sub', text: 'No device with this address has been seen on your network.' }) : null,
  ] : null;

  // Public records
  const P = r.public;
  let pub = null;
  if (P) {
    const errs = Object.entries(P.errors || {});
    const reg = P.registration;
    const mail = P.mail;
    const cert = P.certificates;
    pub = [
      el('h3', { class: 'section-title', text: 'Public records' }),
      el('div', { class: 'chart-grid' },
        P.asn || P.reverseDns ? el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'Network owner' }), kvTable([
          ['Owner (ASN)', P.asn ? `${P.asn.name || ''} (AS${P.asn.asn})` : null], ['Prefix', P.asn && P.asn.prefix], ['Country', P.asn && P.asn.country],
          ['Reverse DNS', P.reverseDns]])) : null,
        reg ? el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'Registration (RDAP)' }), kvTable([
          ['Registrar', reg.registrar], ['Organisation', reg.organisation], ['Network', reg.network], ['Range', reg.range], ['Country', reg.country],
          ['Registered', reconDate(reg.registered)], ['Expires', reconDate(reg.expires)], ['Last changed', reconDate(reg.changed)],
          ['Status', reg.status && reg.status.join(', ')], ['Name servers', reg.nameservers]])) : null,
        mail ? el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'Mail security' }), kvTable([
          ['Mail servers', mail.hasMx ? (P.dns && P.dns.MX) || 'yes' : 'none (this domain cannot receive mail)'],
          ['SPF', mail.spf || el('span', { class: 'badge warn', text: 'missing' })],
          ['DMARC', mail.dmarc || el('span', { class: 'badge warn', text: 'missing - others can send mail pretending to be this domain' })]])) : null,
        P.dns ? el('div', { class: 'card' }, el('div', { class: 'stat-label', text: 'DNS records' }),
          kvTable(['A', 'AAAA', 'NS', 'CAA', 'TXT'].map((t) => [t, P.dns[t]]))) : null,
        cert ? el('div', { class: 'card wide' }, el('div', { class: 'stat-label', text: `Certificates (crt.sh): ${fmtNum(cert.valid)} valid, ${fmtNum(cert.totalNames)} names` }),
          el('p', { class: 'sub', text: `Newest issued ${reconDate(cert.newestIssued) || '-'}. Every name below has had a public certificate, so it is visible to anyone - including subdomains you may think are private.` }),
          el('div', { class: 'recon-names' }, cert.names.map((n) => el('span', { class: 'chip mono', text: n }))),
          cert.totalNames > cert.names.length ? el('p', { class: 'sub', text: `…and ${cert.totalNames - cert.names.length} more.` }) : null) : null),
      errs.length ? el('p', { class: 'sub', text: 'Not available right now: ' + errs.map(([k, v]) => `${k} (${v})`).join(', ') + '. Try again in a minute.' }) : null,
    ];
  }

  // Outside tools
  const tools = r.links && r.links.length ? [
    el('h3', { class: 'section-title', text: 'Open in other tools' }),
    el('p', { class: 'sub', text: 'These open the outside service in a new tab. That service sees what you looked up.' }),
    el('div', { class: 'recon-links' }, r.links.map((x) => el('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer', class: 'chip' }, x.name))),
  ] : null;

  // Plain-English summary from the local AI (idea 7): facts go only to the lab's own Ollama GPU.
  const explainOut = el('div', {});
  const explainBtn = el('button', { class: 'btn secondary small', onclick: async () => {
    explainBtn.disabled = true; fill(explainOut, el('div', { class: 'spinner', text: 'The local AI is reading the results…' }));
    try {
      const x = await api('/recon/summary', { method: 'POST', body: { q: r.query } });
      fill(explainOut, el('div', { class: 'card recon-ai' }, el('div', { class: 'stat-label', text: `Plain English · ${x.model} on your GPU · ${x.seconds}s` }), el('p', { text: x.text }),
        el('p', { class: 'sub', text: 'Written by a local model from the facts above. It can be wrong - check the details before acting.' })));
    } catch (e) { fill(explainOut, errorBox(e)); }
    explainBtn.disabled = false;
  } }, icon('book'), 'Explain in plain English');
  const explain = r.type !== 'hash' && r.type !== 'username' ? [el('div', { class: 'toolbar mt14' }, explainBtn,
    el('span', { class: 'sub', text: 'Uses your own Ollama (LXC 131). Nothing leaves the lab.' })), explainOut] : null;

  // Block helper (idea 8): ready-to-paste OPNsense alias entries. The owner makes firewall changes; Prxy Core only reads.
  const blockIp = r.type === 'ip' && !r.internal && !r.ownPublic ? r.query : (r.type === 'url' && r.local && !r.internal ? r.host : null);
  const copyBtn = (text) => el('button', { class: 'btn secondary small', onclick: () => navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Copy failed - select it by hand')) }, 'Copy');
  const prefix = P && P.asn && P.asn.prefix;
  const blockHelp = blockIp ? [
    el('h3', { class: 'section-title', text: 'Block it in OPNsense' }),
    el('div', { class: 'card' },
      kvTable([['This address', el('span', {}, el('code', { text: blockIp }), ' ', copyBtn(blockIp))],
        ['Whole network', prefix ? el('span', {}, el('code', { text: prefix }), ' ', copyBtn(prefix), ' ',
          el('span', { class: 'badge warn', text: `blocks everyone on ${P.asn.name ? P.asn.name.split(' - ')[0] : 'this network'}` })) : null]]),
      el('ol', { class: 'recon-steps' },
        el('li', {}, 'OPNsense → Firewall → Aliases. Open (or create once) an alias named ', el('code', { text: 'prxy_blocklist' }), ', type ', el('b', { text: 'Network(s)' }), '.'),
        el('li', {}, 'Paste the address (or network) as a new line, add a description such as today’s date and the reason, then Save and Apply.'),
        el('li', {}, 'Only once: Firewall → Rules → Floating → add a ', el('b', { text: 'Block' }), ' rule, direction ', el('b', { text: 'any' }), ', destination ', el('code', { text: 'prxy_blocklist' }),
          ', logging on. Add a second one with the alias as the ', el('b', { text: 'source' }), '. Prxy Core will show the rule change on the Network page.')),
      el('p', { class: 'sub', text: 'Inbound traffic is already dropped by default (your Starlink address is behind carrier NAT), so blocking mainly matters for traffic your own devices start. Avoid blocking whole cloud or ISP networks - they host many unrelated sites.' })),
  ] : null;

  const own = r.ownPublic ? el('div', { class: 'alert info' }, icon('home'), el('div', {}, el('b', { text: 'This is your own address on the internet' }),
    ' (what websites see when anyone at home browses). Firewall blocks "from" it are usually replies that came back through Starlink\u2019s carrier NAT after a connection had already closed - normal, and nothing to block.')) : null;
  fill(body, head, own, explain, local, pub, blockHelp, tools,
    r.internal && !L ? el('div', { class: 'alert info' }, icon('lock'), 'This points inside your network, so nothing was sent to outside services.') : null,
    el('p', { class: 'sub mt14', text: 'Sources: ' + (r.sources.length ? r.sources.join('; ') : 'links only') + '.' }));
}

function reconTabs(active) {
  const tab = (name, href) => el('button', { class: active === name ? 'active' : '', onclick: () => { location.hash = href; } }, name);
  return el('div', { class: 'seg', role: 'group', 'aria-label': 'Recon views' }, tab('Look up', '#/recon'), tab('Exposure', '#/recon/exposure'));
}

// People-search sites and opt-out pages (checked 2026-10-18; some show a bot check to scripts but open in a browser).
// The "done" ticks live only in this browser's localStorage - Prxy Core never stores names.
const BROKERS = [
  ['Spokeo', 'https://www.spokeo.com/optout'], ['Whitepages', 'https://www.whitepages.com/suppression-requests'],
  ['BeenVerified', 'https://www.beenverified.com/app/optout/search'], ['PeopleConnect (Intelius, TruthFinder, Instant Checkmate, US Search)', 'https://suppression.peopleconnect.us/login'],
  ['PeopleFinders', 'https://www.peoplefinders.com/opt-out'], ['TruePeopleSearch', 'https://www.truepeoplesearch.com/removal'],
  ['FastPeopleSearch', 'https://www.fastpeoplesearch.com/removal'], ['Radaris', 'https://radaris.com/control/privacy'],
  ['MyLife', 'https://www.mylife.com/ccpa/index.pubview'], ['LexisNexis', 'https://optout.lexisnexis.com/'],
  ['Acxiom', 'https://isapps.acxiom.com/optout/optout.aspx'], ['ThatsThem', 'https://thatsthem.com/optout'],
  ['SearchPeopleFree', 'https://www.searchpeoplefree.com/opt-out'], ['USPhoneBook', 'https://www.usphonebook.com/opt-out'],
  ['California DROP: one request to every registered data broker', 'https://privacy.ca.gov/drop/'],
  ['Google: Results about you (remove search results with your contact details)', 'https://myactivity.google.com/results-about-you'],
];

async function viewExposure() {
  const body = el('div', {}, el('div', { class: 'spinner', text: 'Loading…' }));
  render(shell('Recon', [pageHead('Recon', 'What the outside world can see about you'), el('div', { class: 'toolbar' }, reconTabs('Exposure')), body]));
  let d;
  try { d = await api('/exposure'); } catch (e) { fill(body, errorBox(e)); return; }
  const ago = (sec) => (sec ? fmtAgo(new Date(sec * 1000).toISOString()) : 'not yet');
  const recheck = el('button', { class: 'btn secondary small', onclick: async () => {
    try { await api('/exposure/refresh', { method: 'POST' }); toast('Re-checking - this takes about a minute'); setTimeout(viewExposure, 45000); } catch (e) { toast(e.message); }
  } }, icon('refresh'), d.running ? 'Checking…' : 'Check now');

  const domainCard = (x) => {
    const m = x.mail || {};
    const miss = (text) => el('span', { class: 'badge warn', text });
    const newOnes = x.names.filter((n) => n.isNew);
    return el('div', { class: 'card' },
      el('div', { class: 'stat-label', text: x.domain }),
      kvTable([
        ['Checked', ago(x.checkedAt)],
        ['SPF', m.spf ? 'present' : miss('missing')],
        ['DMARC', m.dmarc ? m.dmarc : miss('missing - others can send mail as this domain')],
        ['Receives mail', m.hasMx === undefined ? null : m.hasMx ? 'yes' : 'no'],
        ['Registrar', x.registration && x.registration.registrar],
        ['Expires', x.daysLeft != null ? `${reconDate(x.registration.expires)} (${x.daysLeft} days)` : 'unknown (registry has no RDAP data)'],
        ['Names in certificate logs', `${x.names.length}${newOnes.length ? ` - ${newOnes.length} new in the last ${d.newDays} days` : ''}`],
      ]),
      x.names.length ? el('div', { class: 'recon-names' }, x.names.slice(0, 40).map((n) => el('span', { class: n.isNew ? 'chip mono new' : 'chip mono', title: `first seen ${ago(n.firstSeen)}`, text: n.name }))) : null,
      x.errors && Object.keys(x.errors).length ? el('p', { class: 'sub', text: 'Last check could not reach: ' + Object.entries(x.errors).map(([k, v]) => `${k} (${v})`).join(', ') }) : null);
  };

  const dmarcHelp = d.domains.some((x) => x.mail && !x.mail.dmarc) ? el('div', { class: 'alert info' }, icon('alert'), el('div', {},
    el('b', { text: 'Fixing a missing DMARC record: ' }), 'in Cloudflare DNS add a TXT record named ', el('code', { text: '_dmarc' }), ' with the value ',
    el('code', { text: 'v=DMARC1; p=reject; adkim=s; aspf=s' }), '. If the domain never sends email, also set its SPF TXT record to ', el('code', { text: 'v=spf1 -all' }),
    ' (keep the Cloudflare Email Routing include if it receives mail). Re-check here afterwards.')) : null;

  // Account check: nothing typed here is sent to Prxy Core or saved.
  const acct = el('input', { class: 'grow mono', type: 'search', placeholder: 'your email address or username', 'aria-label': 'Account to check', autocomplete: 'off', spellcheck: 'false' });
  const acctLinks = el('div', { class: 'recon-links' });
  const showAcct = () => {
    const v = acct.value.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    const L = !v ? [] : isEmail
      ? [['Have I Been Pwned (breaches)', `https://haveibeenpwned.com/account/${encodeURIComponent(v)}`], ['Recon in Prxy Core', `#/recon?q=${encodeURIComponent(v)}`]]
      : [['WhatsMyName (which sites use this name)', `https://whatsmyname.app/?q=${encodeURIComponent(v)}`], ['Recon in Prxy Core', `#/recon?q=${encodeURIComponent(v)}`]];
    fill(acctLinks, L.map(([n, u]) => el('a', { class: 'chip', href: u, ...(u.startsWith('#') ? {} : { target: '_blank', rel: 'noopener noreferrer' }) }, n)));
  };
  acct.addEventListener('input', showAcct);

  // Broker checklist (browser-local)
  const KEY = 'prxy.exposure.brokers';
  let done = {}; try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { done = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* storage blocked */ } };
  const doneCount = () => BROKERS.filter(([n]) => done[n]).length;
  const progress = el('span', { class: 'sub' });
  const setProgress = () => { progress.textContent = `${doneCount()} of ${BROKERS.length} done`; };
  const brokerRows = BROKERS.map(([name, url]) => {
    const cb = el('input', { type: 'checkbox', 'aria-label': `${name} done` }); cb.checked = !!done[name];
    const when = el('span', { class: 'sub', text: done[name] ? `done ${new Date(done[name]).toLocaleDateString()}` : '' });
    cb.addEventListener('change', () => { if (cb.checked) done[name] = Date.now(); else delete done[name]; save(); when.textContent = cb.checked ? `done ${new Date().toLocaleDateString()}` : ''; setProgress(); });
    return el('tr', {}, el('td', {}, cb), el('td', {}, el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: name })), el('td', {}, when));
  });
  setProgress();

  fill(body,
    el('h3', { class: 'section-title' }, 'Your domains', el('span', { class: 'grow' }), recheck),
    el('p', { class: 'sub', text: 'Checked daily. Domain facts only - no personal data is stored. Every name with a public certificate is visible to anyone searching certificate logs.' }),
    el('div', { class: 'chart-grid' }, d.domains.map(domainCard)),
    dmarcHelp,
    el('h3', { class: 'section-title', text: 'Check an account' }),
    el('p', { class: 'sub', text: 'Type one of your own email addresses or usernames. Nothing typed here is saved or sent to Prxy Core; the links open the outside service, which sees what you check.' }),
    el('div', { class: 'toolbar' }, acct), acctLinks,
    el('h3', { class: 'section-title' }, 'People-search opt-outs', el('span', { class: 'grow' }), progress),
    el('p', { class: 'sub', text: 'These sites sell profiles with names, addresses, phone numbers and relatives. Opt out once per person; many relist after a few months, so repeat yearly. Your ticks are saved only in this browser. If a page will not load at home, your NextDNS blocklist may be blocking the broker - open it on mobile data.' }),
    el('table', { class: 'kvtable brokers' }, el('tbody', {}, brokerRows)));
}

function route() {
  if (state.setup) return viewSetup();
  if (!state.user) return viewLogin();
  const [pathPart, query] = (location.hash.slice(1) || '/').split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query || '');
  if (parts[0] === 'db' && parts[2] === 't' && parts.length === 5) return viewTable(parts[1], parts[3], parts[4]);
  if (parts[0] === 'db' && parts.length === 2) return viewDatabase(parts[1]);
  if (parts[0] === 'query') return viewQuery(params);
  if (parts[0] === 'health') return viewHealth();
  if (parts[0] === 'audit') return viewAudit();
  if (parts[0] === 'guide') return viewGuide();
  if (parts[0] === 'databases') return viewDatabases();
  if (parts[0] === 'infra' && parts[1]) return viewGuest(parts[1]);
  if (parts[0] === 'infra') return viewInfra();
  if (parts[0] === 'docker') return viewDocker();
  if (parts[0] === 'network') return viewNetwork(Number(params.get('w')) || 300);
  if (parts[0] === 'security') return viewSecurity();
  if (parts[0] === 'recon' && parts[1] === 'exposure') return viewExposure();
  if (parts[0] === 'recon') return viewRecon(params.get('q') || '');
  if (parts[0] === 'backups') return viewBackups();
  if (parts[0] === 'power') return viewPower();
  if (parts[0] === 'dashboards') return viewDashboards(parts[1] || 'traffic', RANGE_KEYS.includes(params.get('range')) ? params.get('range') : '24h', params.get('ip') || '');
  if (parts[0] === 'monitoring') return viewMonitoring();
  if (parts[0] === 'logs') return viewLogs(params);
  return viewHome();
}

async function boot() {
  try {
    const s = await api('/state');
    state.setup = s.setup;
    state.user = s.user;
  } catch (e) {
    render(el('div', { class: 'main' }, errorBox(e)));
    return;
  }
  route();
}

window.addEventListener('hashchange', route);
boot();
