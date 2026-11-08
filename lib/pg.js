// Read-only access to the managed Postgres server through the `viewer` role.
// The role itself is read-only (default_transaction_read_only + pg_read_all_data);
// everything here adds a second layer: READ ONLY transactions, catalog-validated
// identifiers, row caps and single-statement queries.
const { Pool } = require('pg');
const Cursor = require('pg-cursor');

const MAX_ROWS = 500;
const QUERY_TIMEOUT_MS = 15000;

const base = {
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  application_name: 'prxy-core',
};

const pools = new Map();
function pool(database) {
  if (!pools.has(database)) {
    const p = new Pool({ ...base, database });
    p.on('error', () => {}); // idle client errors are surfaced on next use
    pools.set(database, p);
  }
  return pools.get(database);
}

const SENSITIVE = /(pass|pwd|secret|token|hash|salt|api_?key|private|otp|totp|session|credential|cookie)/i;
// Counters/timestamps that merely mention a secret (token_version, password_changed_at) stay visible.
const NOT_SECRET = /(_version|_count|_at|_expires|_until|_attempts)$/i;
const isSensitive = (name) => SENSITIVE.test(name) && !NOT_SECRET.test(name);
const quoteIdent = (s) => '"' + String(s).replace(/"/g, '""') + '"';

async function q(database, sql, params = []) {
  const client = await pool(database).connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);
    const r = await client.query(sql, params);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function listDatabases() {
  const r = await q('postgres', `
    SELECT d.datname AS name,
           pg_database_size(d.datname) AS bytes,
           has_database_privilege(d.datname, 'CONNECT') AS can_connect,
           pg_get_userbyid(d.datdba) AS owner,
           pg_encoding_to_char(d.encoding) AS encoding,
           (SELECT count(*) FROM pg_stat_activity a WHERE a.datname = d.datname)::int AS connections,
           s.xact_commit, s.xact_rollback, s.blks_hit, s.blks_read, s.deadlocks, s.stats_reset
      FROM pg_database d
      LEFT JOIN pg_stat_database s ON s.datname = d.datname
     WHERE NOT d.datistemplate
     ORDER BY d.datname`);
  return r.rows.map((d) => ({
    ...d,
    bytes: Number(d.bytes),
    cache_hit: Number(d.blks_hit) + Number(d.blks_read) > 0
      ? Number(d.blks_hit) / (Number(d.blks_hit) + Number(d.blks_read)) : null,
  }));
}

// Database names come from the URL; only accept ones the catalog knows and we can reach.
async function assertDatabase(name) {
  const dbs = await listDatabases();
  const d = dbs.find((x) => x.name === name);
  if (!d) throw Object.assign(new Error('Unknown database'), { status: 404 });
  if (!d.can_connect) throw Object.assign(new Error('The viewer role has no CONNECT on this database'), { status: 403 });
  return d;
}

async function listTables(database) {
  await assertDatabase(database);
  const r = await q(database, `
    SELECT n.nspname AS schema, c.relname AS name,
           CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'matview'
                          WHEN 'p' THEN 'partitioned' WHEN 'f' THEN 'foreign' END AS kind,
           GREATEST(c.reltuples, 0)::bigint AS est_rows,
           pg_total_relation_size(c.oid) AS bytes,
           s.n_dead_tup AS dead_rows, s.last_autovacuum, s.last_autoanalyze, s.seq_scan, s.idx_scan
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
     WHERE c.relkind IN ('r','v','m','p','f')
       AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
     ORDER BY n.nspname, c.relname`);
  return r.rows.map((t) => ({ ...t, est_rows: Number(t.est_rows), bytes: Number(t.bytes),
    dead_rows: t.dead_rows == null ? null : Number(t.dead_rows) }));
}

async function describeTable(database, schema, table) {
  await assertDatabase(database);
  const rel = await q(database, `
    SELECT c.oid, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r','v','m','p','f')`, [schema, table]);
  if (!rel.rows.length) throw Object.assign(new Error('Unknown table'), { status: 404 });
  const oid = rel.rows[0].oid;
  const [cols, idx, fks] = await Promise.all([
    q(database, `
      SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
             pg_get_expr(d.adbin, d.adrelid) AS default,
             EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary
                       AND a.attnum = ANY(i.indkey)) AS pk
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attnum`, [oid]),
    q(database, `
      SELECT i.relname AS name, pg_get_indexdef(x.indexrelid) AS definition,
             pg_relation_size(x.indexrelid) AS bytes, s.idx_scan AS scans
        FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
        LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = x.indexrelid
       WHERE x.indrelid = $1 ORDER BY i.relname`, [oid]),
    q(database, `
      SELECT conname AS name, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE conrelid = $1 AND contype = 'f' ORDER BY conname`, [oid]),
  ]);
  return {
    columns: cols.rows.map((c) => ({ ...c, sensitive: isSensitive(c.name) })),
    indexes: idx.rows.map((i) => ({ ...i, bytes: Number(i.bytes), scans: i.scans == null ? null : Number(i.scans) })),
    foreign_keys: fks.rows,
  };
}

function maskRows(fields, rows) {
  const masked = fields.map((f) => isSensitive(f));
  if (!masked.some(Boolean)) return { rows, masked: [] };
  return {
    rows: rows.map((r) => r.map((v, i) => (masked[i] && v != null ? '••••••' : v))),
    masked: fields.filter((_, i) => masked[i]),
  };
}

async function browseTable(database, schema, table, { limit = 100, offset = 0, orderBy, dir, unmask } = {}) {
  const meta = await describeTable(database, schema, table);
  const names = meta.columns.map((c) => c.name);
  limit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), MAX_ROWS);
  offset = Math.max(parseInt(offset, 10) || 0, 0);
  let order = '';
  if (orderBy) {
    if (!names.includes(orderBy)) throw Object.assign(new Error('Unknown column'), { status: 400 });
    order = ` ORDER BY ${quoteIdent(orderBy)} ${dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
  }
  const sql = `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)}${order} LIMIT ${limit} OFFSET ${offset}`;
  const r = await q(database, { text: sql, rowMode: 'array' });
  const fields = r.fields.map((f) => f.name);
  const out = unmask ? { rows: r.rows, masked: [] } : maskRows(fields, r.rows);
  return { fields, ...out, limit, offset };
}

// Free-form console. Extended protocol rejects multiple statements, the
// transaction is READ ONLY, and a cursor caps how many rows ever leave the server.
async function runQuery(database, sql, { unmask } = {}) {
  await assertDatabase(database);
  if (typeof sql !== 'string' || !sql.trim()) throw Object.assign(new Error('Empty query'), { status: 400 });
  if (sql.length > 20000) throw Object.assign(new Error('Query too long'), { status: 400 });
  const client = await pool(database).connect();
  const started = Date.now();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);
    const cursor = client.query(new Cursor(sql.trim().replace(/;\s*$/, ''), [], { rowMode: 'array' }));
    const rows = await cursor.read(MAX_ROWS + 1);
    const fields = (cursor._result && cursor._result.fields || []).map((f) => f.name);
    await cursor.close();
    await client.query('ROLLBACK');
    const truncated = rows.length > MAX_ROWS;
    if (truncated) rows.length = MAX_ROWS;
    const out = unmask ? { rows, masked: [] } : maskRows(fields, rows);
    return { fields, ...out, truncated, ms: Date.now() - started };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    e.ms = Date.now() - started;
    throw e;
  } finally {
    client.release();
  }
}

async function health() {
  const [server, activity, longRunning, locks] = await Promise.all([
    q('postgres', `
      SELECT version() AS version, pg_postmaster_start_time() AS started,
             current_setting('max_connections')::int AS max_connections,
             (SELECT count(*) FROM pg_stat_activity)::int AS connections,
             current_setting('shared_buffers') AS shared_buffers,
             (SELECT checkpoints_timed + checkpoints_req FROM pg_stat_bgwriter)::bigint AS checkpoints`),
    q('postgres', `
      SELECT datname, usename, application_name, client_addr::text, state, count(*)::int AS n
        FROM pg_stat_activity WHERE backend_type = 'client backend'
       GROUP BY 1,2,3,4,5 ORDER BY n DESC`),
    q('postgres', `
      SELECT pid, datname, usename, state, now() - query_start AS running_for, left(query, 200) AS query
        FROM pg_stat_activity
       WHERE state <> 'idle' AND backend_type = 'client backend' AND pid <> pg_backend_pid()
         AND now() - query_start > interval '5 seconds'
       ORDER BY query_start`),
    q('postgres', `SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted`),
  ]);
  return {
    server: server.rows[0],
    activity: activity.rows,
    long_running: longRunning.rows.map((r) => ({ ...r, running_for: String(r.running_for && r.running_for.toPostgres ? r.running_for.toPostgres() : r.running_for) })),
    waiting_locks: locks.rows[0].waiting,
  };
}

async function ping() {
  const t = Date.now();
  await q('postgres', 'SELECT 1');
  return Date.now() - t;
}

module.exports = { q, listDatabases, listTables, describeTable, browseTable, runQuery, health, ping, MAX_ROWS };
