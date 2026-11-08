// App-local state (users, sessions, audit log, saved queries, size history).
// Lives in SQLite on this container - never in the databases being managed.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/var/lib/prxy-core';
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'prxy-core.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  pw_hash TEXT NOT NULL,
  totp_secret TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  username TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  rows INTEGER,
  ms INTEGER,
  ok INTEGER NOT NULL DEFAULT 1,
  ip TEXT
);
CREATE TABLE IF NOT EXISTS saved_queries (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  database TEXT NOT NULL,
  sql TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS devices (
  key TEXT PRIMARY KEY,          -- MAC (wifi) or IP (lan)
  kind TEXT NOT NULL,            -- 'wifi' | 'lan'
  name TEXT, ip TEXT, ssid TEXT, network TEXT, ap TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  known INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS size_snapshots (
  ts INTEGER NOT NULL,
  database TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  PRIMARY KEY (ts, database)
);
`);

function audit(entry) {
  db.prepare(`INSERT INTO audit (username, action, target, detail, rows, ms, ok, ip)
              VALUES (@username, @action, @target, @detail, @rows, @ms, @ok, @ip)`)
    .run({
      username: entry.username ?? null,
      action: entry.action,
      target: entry.target ?? null,
      detail: entry.detail ?? null,
      rows: entry.rows ?? null,
      ms: entry.ms ?? null,
      ok: entry.ok === false ? 0 : 1,
      ip: entry.ip ?? null,
    });
}

module.exports = { db, audit };
