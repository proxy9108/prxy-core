// Runs allowlisted service actions on LXCs over SSH. The key only works from
// this host and is pinned to /usr/local/sbin/prxy-action on each target (see
// deploy/prxy-action), so even a compromised Prxy Core can only restart/inspect
// the services listed in that host's /etc/prxy-action.allow.
const { execFile } = require('child_process');
const { GUESTS } = require('./services');

const fs = require('fs');

const KEY = process.env.ACTION_SSH_KEY || '/etc/prxy-core/ssh/id_ed25519';
const KNOWN_HOSTS = process.env.ACTION_KNOWN_HOSTS || '/etc/prxy-core/ssh/known_hosts';
const OPS = ['restart', 'status', 'logs'];
const ALL_OPS = [...OPS, 'list'];
const NAME_RE = /^[A-Za-z0-9@._-]+$/;

// Every action target Prxy Core knows: { vmid, ip, kind, name }.
function targets() {
  const out = [];
  for (const [vmid, g] of Object.entries(GUESTS)) {
    for (const unit of g.units || []) out.push({ vmid: Number(vmid), ip: g.ip, kind: 'systemd', name: unit });
    for (const c of g.containers || []) out.push({ vmid: Number(vmid), ip: g.ip, kind: 'docker', name: c });
  }
  return out;
}

function findTarget(vmid, name) {
  return targets().find((t) => t.vmid === Number(vmid) && t.name === name) || null;
}

// The SSH action channel is optional: until its key and known_hosts exist,
// service/container actions and app-backup listings report "not set up".
function configured() {
  try { fs.accessSync(KEY, fs.constants.R_OK); fs.accessSync(KNOWN_HOSTS, fs.constants.R_OK); return true; } catch { return false; }
}

function run(ip, op, name) {
  if (!configured()) return Promise.reject(Object.assign(new Error('Service actions are not set up yet (SSH action channel needs approval)'), { status: 503 }));
  if (!ALL_OPS.includes(op) || !NAME_RE.test(name)) return Promise.reject(Object.assign(new Error('Bad action'), { status: 400 }));
  return new Promise((resolve) => {
    const started = Date.now();
    execFile('ssh', [
      '-i', KEY, '-o', `UserKnownHostsFile=${KNOWN_HOSTS}`, '-o', 'StrictHostKeyChecking=yes',
      '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6', '-o', 'IdentitiesOnly=yes',
      `root@${ip}`, `${op} ${name}`,
    ], { timeout: op === 'restart' ? 90000 : 20000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? (err.code ?? null) : 0, output: (stdout || '') + (stderr ? `\n${stderr}` : ''), ms: Date.now() - started });
    });
  });
}

function parseStatus(text) {
  return Object.fromEntries(text.split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k.trim(), v.join('=').trim()]));
}

// App-level backup folders (e.g. AutoTrack's nightly tarballs), listed read-only.
async function listBackupDirs() {
  const out = [];
  if (!configured()) {
    for (const [vmid, g] of Object.entries(GUESTS)) {
      for (const d of g.backupDirs || []) out.push({ vmid: Number(vmid), host: g.name, label: d.label, title: d.title, path: d.path, ok: false, notSetUp: true, error: 'Needs the SSH action channel', files: [] });
    }
    return out;
  }
  for (const [vmid, g] of Object.entries(GUESTS)) {
    for (const d of g.backupDirs || []) {
      const r = await run(g.ip, 'list', d.label);
      const files = r.ok ? r.output.trim().split('\n').filter(Boolean).map((l) => {
        const [t, size, ...name] = l.split(' ');
        return { mtime: Math.round(Number(t) * 1000), size: Number(size), name: name.join(' ') };
      }).sort((a, b) => b.mtime - a.mtime) : [];
      out.push({ vmid: Number(vmid), host: g.name, label: d.label, title: d.title, path: d.path, ok: r.ok, error: r.ok ? null : r.output.trim(), files });
    }
  }
  return out;
}

module.exports = { configured, targets, findTarget, run, parseStatus, listBackupDirs, OPS };
