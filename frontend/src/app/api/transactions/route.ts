import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

const BASE_SQL = `SELECT t.*, a.name as agent_name, a.skill as agent_skill, j.description as job_description
  FROM transactions t LEFT JOIN agents a ON a.id = t.agent_id LEFT JOIN jobs j ON j.id = t.job_id`;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agent_id');
    const jobId = searchParams.get('job_id');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100') || 100, 500);

    let txs;
    if (agentId && jobId) {
      txs = await query(`${BASE_SQL} WHERE t.agent_id = ? AND t.job_id = ? ORDER BY t.created_at DESC LIMIT ?`, [agentId, jobId, limit]);
    } else if (agentId) {
      txs = await query(`${BASE_SQL} WHERE t.agent_id = ? ORDER BY t.created_at DESC LIMIT ?`, [agentId, limit]);
    } else if (jobId) {
      txs = await query(`${BASE_SQL} WHERE t.job_id = ? ORDER BY t.created_at DESC LIMIT ?`, [jobId, limit]);
    } else {
      txs = await query(`${BASE_SQL} ORDER BY t.created_at DESC LIMIT ?`, [limit]);
    }
    return NextResponse.json(txs);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
