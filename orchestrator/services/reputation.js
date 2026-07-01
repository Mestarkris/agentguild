const { getDb } = require('../db');
const { v4: uuidv4 } = require('uuid');

const SLASH_AMOUNT = 0.01;
const MIN_BOND = 0.01;

function slashAgent(agentId, jobId, reason) {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const currentBond = agent.bond_amount - agent.bond_slashed;
  if (currentBond <= MIN_BOND) {
    console.warn(`[Reputation] Agent ${agentId} bond already minimal, skipping slash`);
    return { slashed: 0, newBond: currentBond };
  }

  const slashAmt = Math.min(SLASH_AMOUNT, currentBond - MIN_BOND);

  db.prepare(`UPDATE agents SET bond_slashed = bond_slashed + ?, avg_quality = MAX(0.1, avg_quality - 0.1) WHERE id = ?`)
    .run(slashAmt, agentId);
  db.prepare(`INSERT INTO bond_slashes (id, agent_id, job_id, slash_amount, reason) VALUES (?, ?, ?, ?, ?)`)
    .run(uuidv4(), agentId, jobId || null, slashAmt, reason);

  console.log(`[Reputation] Slashed ${slashAmt} USDC from agent ${agentId} (reason: ${reason})`);
  return { slashed: slashAmt, newBond: currentBond - slashAmt };
}

function updateQuality(agentId, qualityScore) {
  const db = getDb();
  db.prepare(`
    UPDATE agents SET avg_quality = (avg_quality * 0.9 + ? * 0.1)
    WHERE id = ?
  `).run(qualityScore, agentId);
}

function getBondStatus(agentId) {
  const db = getDb();
  const agent = db.prepare('SELECT bond_amount, bond_slashed, avg_quality FROM agents WHERE id = ?').get(agentId);
  if (!agent) return null;
  return {
    total: agent.bond_amount,
    slashed: agent.bond_slashed,
    available: agent.bond_amount - agent.bond_slashed,
    healthPct: (agent.bond_amount - agent.bond_slashed) / agent.bond_amount,
    avgQuality: agent.avg_quality,
  };
}

module.exports = { slashAgent, updateQuality, getBondStatus };
