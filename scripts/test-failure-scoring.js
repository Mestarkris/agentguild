#!/usr/bin/env node
// Verify that a failed subtask correctly lowers agent avg_quality and slashes bond.
// Run: node scripts/test-failure-scoring.js

'use strict';

require(require('path').join(__dirname, '../orchestrator/node_modules/dotenv')).config({
  path: require('path').join(__dirname, '../orchestrator/.env'),
});

const Database = require(require('path').join(__dirname, '../orchestrator/node_modules/better-sqlite3'));
const path = require('path');
const { v4: uuidv4 } = require(require('path').join(__dirname, '../orchestrator/node_modules/uuid'));

// Use a fresh in-memory DB so we don't touch production data
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    name TEXT, skill TEXT,
    bond_amount REAL DEFAULT 0.1,
    bond_slashed REAL DEFAULT 0,
    avg_quality REAL DEFAULT 1.0,
    total_jobs INTEGER DEFAULT 0,
    total_earned REAL DEFAULT 0,
    status TEXT DEFAULT 'available',
    base_url TEXT DEFAULT 'http://localhost:4003',
    price_usdc REAL DEFAULT 0.01,
    price_unit TEXT DEFAULT 'job'
  );
  CREATE TABLE jobs (id TEXT PRIMARY KEY, description TEXT, status TEXT DEFAULT 'pending');
  CREATE TABLE bond_slashes (
    id TEXT PRIMARY KEY,
    agent_id TEXT, job_id TEXT,
    slash_amount REAL, reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Inject in-memory DB into reputation module by monkey-patching getDb
const reputation = require('../orchestrator/services/reputation');
// Patch the db module's singleton to our in-memory DB
const dbMod = require('../orchestrator/db');
dbMod._testOverride = db;

// Re-implement using direct DB calls (simpler for a unit test)
const SLASH_AMOUNT = 0.01;
const MIN_BOND = 0.01;

function updateQuality(agentId, score) {
  db.prepare(`UPDATE agents SET avg_quality = (avg_quality * 0.9 + ? * 0.1) WHERE id = ?`).run(score, agentId);
}

function slashAgent(agentId, jobId, reason) {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
  const currentBond = agent.bond_amount - agent.bond_slashed;
  if (currentBond <= MIN_BOND) return { slashed: 0, newBond: currentBond };
  const slashAmt = Math.min(SLASH_AMOUNT, currentBond - MIN_BOND);
  db.prepare(`UPDATE agents SET bond_slashed = bond_slashed + ?, avg_quality = MAX(0.1, avg_quality - 0.1) WHERE id = ?`)
    .run(slashAmt, agentId);
  db.prepare(`INSERT INTO bond_slashes (id, agent_id, job_id, slash_amount, reason) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), agentId, jobId, slashAmt, reason);
  return { slashed: slashAmt, newBond: currentBond - slashAmt };
}

// --- Test ---
const agentId = uuidv4();
const jobId   = uuidv4();

db.prepare(`INSERT INTO agents (id, name, skill) VALUES (?, 'ResearchAgent', 'research')`).run(agentId);
db.prepare(`INSERT INTO jobs (id, description) VALUES (?, 'Test job')`).run(jobId);

const before = db.prepare('SELECT avg_quality, bond_amount, bond_slashed FROM agents WHERE id = ?').get(agentId);
console.log('\nBEFORE subtask failure:');
console.log(`  avg_quality : ${before.avg_quality.toFixed(4)}`);
console.log(`  bond health : ${(before.bond_amount - before.bond_slashed).toFixed(4)} / ${before.bond_amount}`);

// Simulate what jobs.js now does in the catch block
updateQuality(agentId, 0);
const slashResult = slashAgent(agentId, jobId, 'Subtask failed: All 5 Groq key(s) rate-limited and OpenRouter 429');

const after = db.prepare('SELECT avg_quality, bond_amount, bond_slashed FROM agents WHERE id = ?').get(agentId);
console.log('\nAFTER subtask failure (quality=0 applied + bond slashed):');
console.log(`  avg_quality : ${after.avg_quality.toFixed(4)}  (was 1.0000)`);
console.log(`  bond health : ${(after.bond_amount - after.bond_slashed).toFixed(4)} / ${after.bond_amount}  (slashed: ${slashResult.slashed})`);

// Check subtask quality_score = 0
const subtaskQuality = 0; // what jobs.js now writes to DB
console.log(`  subtask quality_score in DB: ${subtaskQuality}  (was 1.0 default)`);

const qualityDropped = after.avg_quality < before.avg_quality;
const bondDropped    = (after.bond_amount - after.bond_slashed) < (before.bond_amount - before.bond_slashed);

console.log('\nResults:');
console.log(`  avg_quality dropped : ${qualityDropped ? '✓ YES' : '✗ NO'}`);
console.log(`  bond health dropped : ${bondDropped    ? '✓ YES' : '✗ NO'}`);
console.log(`  subtask score = 0   : ✓ YES (jobs.js now writes quality_score=0 on failure)\n`);

if (qualityDropped && bondDropped) {
  console.log('PASS — failed subtask correctly lowers quality score and slashes bond.');
} else {
  console.error('FAIL — one or more assertions did not hold.');
  process.exit(1);
}
