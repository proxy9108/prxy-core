const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const { db } = require('./store');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'prxy_session';

authenticator.options = { window: 1 };

// Real hash of a random string, compared against for unknown usernames.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hasUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
}

// One-time setup token so only someone who can read the server log can
// claim the first admin account - the setup page is otherwise open on the LAN.
// Persisted (0600, data dir) so a service restart during first-run setup doesn't
// invalidate the token the admin already copied from the log.
const TOKEN_FILE = path.join(process.env.DATA_DIR || '/var/lib/prxy-core', 'setup-token');
let setupToken = null;
function getSetupToken() {
  if (hasUsers()) return null;
  if (!setupToken) {
    try { setupToken = fs.readFileSync(TOKEN_FILE, 'utf8').trim() || null; } catch { /* first start */ }
  }
  if (!setupToken) {
    setupToken = crypto.randomBytes(12).toString('base64url');
    fs.writeFileSync(TOKEN_FILE, setupToken, { mode: 0o600 });
  }
  return setupToken;
}
function checkSetupToken(token) {
  const expected = getSetupToken();
  if (!expected || typeof token !== 'string' || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function createUser(username, password, totpSecret) {
  const pw_hash = bcrypt.hashSync(password, 12);
  db.prepare('INSERT INTO users (username, pw_hash, totp_secret) VALUES (?, ?, ?)')
    .run(username, pw_hash, totpSecret);
  setupToken = null;
  try { fs.unlinkSync(TOKEN_FILE); } catch { /* already gone */ }
}

function verifyLogin(username, password, code) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // Always run a bcrypt compare so response timing doesn't reveal which usernames exist.
  const hash = user ? user.pw_hash : DUMMY_HASH;
  const pwOk = bcrypt.compareSync(password || '', hash);
  if (!user || !pwOk) return null;
  if (!authenticator.check(String(code || '').replace(/\s/g, ''), user.totp_secret)) return null;
  return user;
}

// Step-up check for actions: a fresh TOTP code, each code usable once
// (otherwise anyone watching over a shoulder could replay it within 30 s).
const usedCodes = new Map(); // userId -> Set of "code@window"
function verifyStepUp(userId, code) {
  const user = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(userId);
  const c = String(code || '').replace(/\s/g, '');
  if (!user || !/^\d{6}$/.test(c) || !authenticator.check(c, user.totp_secret)) return false;
  const windowKey = `${c}@${Math.floor(Date.now() / 30000)}`;
  const prevKey = `${c}@${Math.floor(Date.now() / 30000) - 1}`;
  const seen = usedCodes.get(userId) || new Set();
  if (seen.has(windowKey) || seen.has(prevKey)) return false;
  seen.add(windowKey);
  if (seen.size > 20) seen.delete(seen.values().next().value);
  usedCodes.set(userId, seen);
  return true;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, Date.now() + SESSION_TTL_MS);
  return token;
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

function readCookie(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

function sessionUser(req) {
  const token = readCookie(req);
  if (!token) return null;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  return db.prepare(`SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
                     WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha256(token), Date.now()) || null;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

function requireAuth(req, res, next) {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  req.user = user;
  next();
}

// Cross-site requests can't set custom headers without a CORS preflight we
// never allow, so requiring one on state-changing calls blocks CSRF.
function requireAppHeader(req, res, next) {
  if (req.method !== 'GET' && req.get('X-Prxy') !== '1') {
    return res.status(403).json({ error: 'Missing request header' });
  }
  next();
}

module.exports = {
  authenticator, verifyStepUp, hasUsers, getSetupToken, checkSetupToken, createUser, verifyLogin,
  createSession, destroySession, readCookie, sessionUser, setSessionCookie,
  clearSessionCookie, requireAuth, requireAppHeader,
};
