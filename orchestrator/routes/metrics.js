const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_jobs,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
      SUM(total_price_usdc) as total_usdc_settled,
      AVG(CASE WHEN status = 'completed' THEN
        (julianday(completed_at) - julianday(submitted_at)) * 86400 END) as avg_settlement_secs
    FROM jobs
  `).get();

  const agentCount = db.prepare(`SELECT COUNT(*) as count FROM agents`).get();
  const earningAgents = db.prepare(`SELECT COUNT(*) as count FROM agents WHERE total_earned > 0`).get();
  const avgAgentsPerJob = db.prepare(`
    SELECT AVG(cnt) as avg FROM (
      SELECT COUNT(*) as cnt FROM subtasks GROUP BY job_id
    )
  `).get();

  const slashes = db.prepare(`SELECT COUNT(*) as count FROM bond_slashes`).get();

  const topAgents = db.prepare(`
    SELECT name, skill, total_earned, total_jobs, avg_quality,
           (bond_amount - bond_slashed) as bond_health
    FROM agents ORDER BY total_earned DESC LIMIT 5
  `).all();

  const recentJobs = db.prepare(`
    SELECT id, description, status, total_price_usdc, submitted_at, completed_at
    FROM jobs ORDER BY submitted_at DESC LIMIT 10
  `).all();

  const dailyStats = db.prepare(`
    SELECT
      date(submitted_at) as date,
      COUNT(*) as jobs,
      SUM(CASE WHEN status = 'completed' THEN COALESCE(total_price_usdc, 0) ELSE 0 END) as usdc
    FROM jobs
    WHERE submitted_at >= date('now', '-6 days')
    GROUP BY date(submitted_at)
    ORDER BY date ASC
  `).all();

  const skillsDistribution = db.prepare(`
    SELECT a.skill, COUNT(*) as count, COALESCE(SUM(t.amount_usdc), 0) as total_usdc
    FROM transactions t
    JOIN agents a ON a.id = t.agent_id
    GROUP BY a.skill
    ORDER BY count DESC
  `).all();

  const leaderboard = db.prepare(`
    SELECT id, name, skill, total_earned, total_jobs, avg_quality,
           bond_amount, bond_slashed,
           (bond_amount - bond_slashed) as bond_available,
           wallet_address, last_active
    FROM agents ORDER BY total_earned DESC
  `).all();

  res.json({
    totals: {
      jobs_completed: totals.completed_jobs || 0,
      total_jobs: totals.total_jobs || 0,
      usdc_settled: parseFloat((totals.total_usdc_settled || 0).toFixed(4)),
      avg_settlement_secs: parseFloat((totals.avg_settlement_secs || 0).toFixed(1)),
      avg_agents_per_job: parseFloat((avgAgentsPerJob.avg || 0).toFixed(1)),
      agents_registered: agentCount.count,
      agents_earning: earningAgents.count,
      bond_slashes: slashes.count,
    },
    top_agents: topAgents,
    recent_jobs: recentJobs,
    daily_stats: dailyStats,
    skills_distribution: skillsDistribution,
    leaderboard,
  });
});

module.exports = router;
