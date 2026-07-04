/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';

const LOCAL_DB_PATH = path.join(process.cwd(), '..', 'agentguild.local.db');
const BLOB_KEY = 'agentguild-db/agentguild.db';
const IS_VERCEL = !!process.env.VERCEL;

type SqlJsDatabase = {
  run(sql: string, params?: any[]): void;
  prepare(sql: string): { bind(p: any[]): void; step(): boolean; getAsObject(): Record<string, unknown>; free(): void };
  exec(sql: string): void;
  export(): Uint8Array;
  close(): void;
};

let _db: SqlJsDatabase | null = null;
let _dbPromise: Promise<SqlJsDatabase> | null = null;
let _SqlJs: any = null; // cached WASM instance — one per lambda lifetime
let _dirty = false;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _blobUrl: string | null = null;

async function getSqlJs(): Promise<any> {
  if (_SqlJs) return _SqlJs;
  const initSql = require('sql.js/dist/sql-asm.js');
  _SqlJs = await initSql.default();
  return _SqlJs;
}

// Derive the Vercel Blob private URL from the token (no API round-trip needed).
// Token format: vercel_blob_rw_<storeId>_<secret>
// Private blob URL: https://<storeId_lowercase>.private.blob.vercel-storage.com/<path>
function deriveBlobUrl(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const m = token.match(/^vercel_blob_rw_([^_]+)_/);
  if (!m) return null;
  return `https://${m[1].toLowerCase()}.private.blob.vercel-storage.com/${BLOB_KEY}`;
}

async function loadFromBlob(): Promise<Buffer | null> {
  if (!IS_VERCEL || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN!;
    const url = _blobUrl ?? deriveBlobUrl();
    if (!url) return null;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

async function saveToBlob(data: Uint8Array): Promise<void> {
  if (!IS_VERCEL || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { put } = await import('@vercel/blob');
    const result = await put(BLOB_KEY, Buffer.from(data), {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    _blobUrl = result.url;
    console.log('[DB] Persisted to blob:', result.url, `(${data.length} bytes)`);
  } catch (e) {
    console.error('[DB] Failed to persist to blob:', (e as Error).message);
  }
}

function scheduleFlush() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    if (!_db || !_dirty) return;
    const data = _db.export();
    if (IS_VERCEL) {
      await saveToBlob(data);
    } else {
      try { fs.writeFileSync(LOCAL_DB_PATH, Buffer.from(data)); } catch { /* ok */ }
    }
    _dirty = false;
  }, 500);
}

async function openDb(): Promise<SqlJsDatabase> {
  const SqlJs = await getSqlJs();

  let data: Buffer | null = null;
  if (IS_VERCEL) {
    data = await loadFromBlob();
  } else {
    try { if (fs.existsSync(LOCAL_DB_PATH)) data = fs.readFileSync(LOCAL_DB_PATH); } catch { /* new db */ }
  }

  let db: SqlJsDatabase;
  if (data) {
    try {
      db = new SqlJs.Database(new Uint8Array(data));
    } catch {
      // Blob is corrupt — start fresh and nuke the bad blob
      console.error('[DB] Blob corrupt, resetting to fresh database');
      db = new SqlJs.Database();
    }
  } else {
    db = new SqlJs.Database();
  }
  // Set _db before schema init so getDb() doesn't recurse via _dbPromise
  _db = db;
  // Always ensure schema exists — safe on existing DBs (all CREATE IF NOT EXISTS)
  await ensureSchema(db);
  return db;
}

function ensureSchema(db: SqlJsDatabase): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, skill TEXT NOT NULL, description TEXT,
      price_usdc REAL NOT NULL, price_unit TEXT NOT NULL, wallet_id TEXT, wallet_address TEXT,
      bond_amount REAL DEFAULT 0.1, bond_slashed REAL DEFAULT 0, status TEXT DEFAULT 'available',
      base_url TEXT NOT NULL, total_jobs INTEGER DEFAULT 0, total_earned REAL DEFAULT 0,
      avg_quality REAL DEFAULT 1.0, registered_at TEXT DEFAULT (datetime('now')), last_active TEXT
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, description TEXT NOT NULL, status TEXT DEFAULT 'pending',
      total_price_usdc REAL, escrow_tx TEXT, result TEXT, error TEXT,
      submitted_at TEXT DEFAULT (datetime('now')), completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL, agent_id TEXT, skill TEXT NOT NULL,
      prompt TEXT NOT NULL, result TEXT, tokens_used INTEGER DEFAULT 0,
      complexity_weight REAL DEFAULT 1.0, quality_score REAL DEFAULT 1.0,
      contribution_pct REAL, payment_usdc REAL, payment_tx TEXT,
      status TEXT DEFAULT 'pending', position INTEGER, started_at TEXT, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, job_id TEXT, agent_id TEXT, amount_usdc REAL,
      tx_hash TEXT, demo INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bond_slashes (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, job_id TEXT,
      slash_amount REAL, reason TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  for (const ddl of [
    "ALTER TABLE jobs ADD COLUMN job_type TEXT DEFAULT 'auto'",
    'ALTER TABLE jobs ADD COLUMN direct_agent_id TEXT',
  ]) {
    try { db.exec(ddl); } catch { /* column already exists */ }
  }
  return Promise.resolve();
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (_db) return _db;
  if (!_dbPromise) _dbPromise = openDb().catch(e => { _dbPromise = null; throw e; });
  return _dbPromise;
}

export async function query(sql: string, args: unknown[] = []): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(args as any[]);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export async function exec(sql: string, args: unknown[] = []): Promise<void> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(args as any[]);
  stmt.step();
  stmt.free();
  _dirty = true;
  scheduleFlush();
}

// Force-reload the in-memory DB from blob (handles stale warm lambda instances).
// Best-effort — never throws; callers can ignore errors.
export async function reloadFromBlob(): Promise<void> {
  if (!IS_VERCEL) return;
  try {
    const data = await loadFromBlob();
    if (!data) return;
    const SqlJs = await getSqlJs();
    const db = new SqlJs.Database(new Uint8Array(data));
    await ensureSchema(db);
    _db = db;
    _dbPromise = null;
    _dirty = false;
  } catch (e) {
    console.error('[DB] reloadFromBlob failed (non-fatal):', (e as Error).message);
  }
}

export async function flushNow(): Promise<void> {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  if (!_db || !_dirty) return;
  const data = _db.export();
  if (IS_VERCEL) {
    await saveToBlob(data);
  } else {
    try { fs.writeFileSync(LOCAL_DB_PATH, Buffer.from(data)); } catch { /* ok */ }
  }
  _dirty = false;
}

export async function initSchema(): Promise<void> {
  const db = await getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, skill TEXT NOT NULL, description TEXT,
      price_usdc REAL NOT NULL, price_unit TEXT NOT NULL, wallet_id TEXT, wallet_address TEXT,
      bond_amount REAL DEFAULT 0.1, bond_slashed REAL DEFAULT 0, status TEXT DEFAULT 'available',
      base_url TEXT NOT NULL, total_jobs INTEGER DEFAULT 0, total_earned REAL DEFAULT 0,
      avg_quality REAL DEFAULT 1.0, registered_at TEXT DEFAULT (datetime('now')), last_active TEXT
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, description TEXT NOT NULL, status TEXT DEFAULT 'pending',
      total_price_usdc REAL, escrow_tx TEXT, result TEXT, error TEXT,
      submitted_at TEXT DEFAULT (datetime('now')), completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL, agent_id TEXT, skill TEXT NOT NULL,
      prompt TEXT NOT NULL, result TEXT, tokens_used INTEGER DEFAULT 0,
      complexity_weight REAL DEFAULT 1.0, quality_score REAL DEFAULT 1.0,
      contribution_pct REAL, payment_usdc REAL, payment_tx TEXT,
      status TEXT DEFAULT 'pending', position INTEGER, started_at TEXT, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, job_id TEXT, agent_id TEXT, amount_usdc REAL,
      tx_hash TEXT, demo INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bond_slashes (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, job_id TEXT,
      slash_amount REAL, reason TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add direct-hire columns (SQLite ALTER TABLE lacks IF NOT EXISTS)
  for (const ddl of [
    "ALTER TABLE jobs ADD COLUMN job_type TEXT DEFAULT 'auto'",
    'ALTER TABLE jobs ADD COLUMN direct_agent_id TEXT',
  ]) {
    try { db.exec(ddl); } catch { /* column already exists */ }
  }

  _dirty = true;
  scheduleFlush();
}
