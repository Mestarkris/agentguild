const { getDb } = require('../db');

function selectAgent(skill, subtaskPrompt) {
  const db = getDb();
  const candidates = db.prepare(`
    SELECT * FROM agents
    WHERE skill = ? AND status = 'available' AND (bond_amount - bond_slashed) > 0
    ORDER BY avg_quality DESC, price_usdc ASC
    LIMIT 5
  `).all(skill);

  if (candidates.length === 0) {
    const any = db.prepare(`SELECT * FROM agents WHERE skill = ? LIMIT 1`).get(skill);
    return any || null;
  }

  // Weight by: quality (60%) + bond health (30%) + low load (10%)
  const scored = candidates.map(a => {
    const bondHealth = Math.min(1, (a.bond_amount - a.bond_slashed) / a.bond_amount);
    const score = a.avg_quality * 0.6 + bondHealth * 0.3 + (1 / (1 + a.total_jobs * 0.001)) * 0.1;
    return { ...a, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  return scored[0];
}

function estimateJobCost(subtasks, agents) {
  let total = 0;
  for (const st of subtasks) {
    const agent = agents.find(a => a.skill === st.skill);
    if (agent) total += agent.price_usdc * st.complexity_weight;
  }
  return parseFloat(total.toFixed(6));
}

module.exports = { selectAgent, estimateJobCost };
