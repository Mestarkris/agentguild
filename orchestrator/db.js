const Database = require('better-sqlite3');
const path = require('path');

let db;

function getDb() {
  if (!db) {
    db = new Database(path.join(__dirname, 'agentguild.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skill TEXT NOT NULL,
      description TEXT,
      price_usdc REAL NOT NULL,
      price_unit TEXT NOT NULL,
      wallet_id TEXT,
      wallet_address TEXT,
      bond_amount REAL DEFAULT 0.1,
      bond_slashed REAL DEFAULT 0,
      status TEXT DEFAULT 'available',
      base_url TEXT NOT NULL,
      total_jobs INTEGER DEFAULT 0,
      total_earned REAL DEFAULT 0,
      avg_quality REAL DEFAULT 1.0,
      registered_at TEXT DEFAULT (datetime('now')),
      last_active TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      total_price_usdc REAL,
      escrow_tx TEXT,
      result TEXT,
      error TEXT,
      submitted_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      agent_id TEXT REFERENCES agents(id),
      skill TEXT NOT NULL,
      prompt TEXT NOT NULL,
      result TEXT,
      tokens_used INTEGER DEFAULT 0,
      complexity_weight REAL DEFAULT 1.0,
      quality_score REAL DEFAULT 1.0,
      contribution_pct REAL,
      payment_usdc REAL,
      payment_tx TEXT,
      status TEXT DEFAULT 'pending',
      position INTEGER,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      agent_id TEXT,
      amount_usdc REAL,
      tx_hash TEXT,
      demo INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bond_slashes (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      job_id TEXT,
      slash_amount REAL,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { getDb };
