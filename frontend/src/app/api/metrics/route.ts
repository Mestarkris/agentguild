import { NextResponse } from 'next/server';
import { query, reloadFromBlob } from '@/lib/server/db';
import { ensureSeeded } from '@/lib/server/seed';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await reloadFromBlob();
    await ensureSeeded();

    const totalsRows = await query(`
      SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
        COALESCE(SUM(total_price_usdc), 0) as total_usdc_settled,
        COALESCE(AVG(CASE WHEN status = 'completed' AND completed_at IS NOT NULL AND submitted_at IS NOT NULL
          THEN (julianday(completed_at) - julianday(submitted_at)) * 86400 END), 0) as avg_settlement_secs
      FROM jobs
    `);

    const agentCountRows = await query('SELECT COUNT(*) as count FROM agents');
    const earningRows = await query('SELECT COUNT(*) as count FROM agents WHERE total_earned > 0');
    const avgRows = await query('SELECT COALESCE(AVG(cnt), 0) as avg FROM (SELECT COUNT(*) as cnt FROM subtasks GROUP BY job_id)');
    const slashRows = await query('SELECT COUNT(*) as count FROM bond_slashes');

    const topAgents = await query('SELECT name, skill, total_earned, total_jobs, avg_quality, (bond_amount - bond_slashed) as bond_health FROM agents ORDER BY total_earned DESC LIMIT 5');
    const recentJobs = await query('SELECT id, description, status, total_price_usdc, submitted_at, completed_at FROM jobs ORDER BY submitted_at DESC LIMIT 10');
    const dailyStats = await query(`
      SELECT
        date(submitted_at) as date,
        COUNT(*) as jobs,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN COALESCE(total_price_usdc, 0) ELSE 0 END), 0) as usdc
      FROM jobs
      WHERE submitted_at >= date('now', '-6 days')
      GROUP BY date(submitted_at)
      ORDER BY date ASC
    `);
    const skillsDistribution = await query(`
      SELECT a.skill, COUNT(*) as count, COALESCE(SUM(t.amount_usdc), 0) as total_usdc
      FROM transactions t JOIN agents a ON a.id = t.agent_id
      GROUP BY a.skill ORDER BY count DESC
    `);
    const leaderboard = await query(`
      SELECT id, name, skill, total_earned, total_jobs, avg_quality,
             bond_amount, bond_slashed, (bond_amount - bond_slashed) as bond_available,
             wallet_address, last_active
      FROM agents ORDER BY total_earned DESC
    `);

    const t = totalsRows[0] ?? {};
    return NextResponse.json({
      totals: {
        jobs_completed: Number(t.completed_jobs) || 0,
        total_jobs: Number(t.total_jobs) || 0,
        usdc_settled: parseFloat(Number(t.total_usdc_settled || 0).toFixed(4)),
        avg_settlement_secs: parseFloat(Number(t.avg_settlement_secs || 0).toFixed(1)),
        avg_agents_per_job: parseFloat(Number(avgRows[0]?.avg || 0).toFixed(1)),
        agents_registered: Number(agentCountRows[0]?.count) || 0,
        agents_earning: Number(earningRows[0]?.count) || 0,
        bond_slashes: Number(slashRows[0]?.count) || 0,
      },
      top_agents: topAgents,
      recent_jobs: recentJobs,
      daily_stats: dailyStats,
      skills_distribution: skillsDistribution,
      leaderboard,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
