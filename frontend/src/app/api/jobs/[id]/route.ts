import { NextRequest, NextResponse } from 'next/server';
import { query, reloadFromBlob } from '@/lib/server/db';
import { slashAgent } from '@/lib/server/runner';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let rows = await query('SELECT * FROM jobs WHERE id = ?', [id]);
    // Warm lambda may have stale in-memory DB — reload from blob once on miss
    if (!rows[0]) {
      await reloadFromBlob();
      rows = await query('SELECT * FROM jobs WHERE id = ?', [id]);
    }
    if (!rows[0]) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    const job = rows[0];
    const subtasks = await query(
      `SELECT st.*, a.name as agent_name, a.skill
       FROM subtasks st LEFT JOIN agents a ON a.id = st.agent_id
       WHERE st.job_id = ? ORDER BY st.position`,
      [id]
    );
    return NextResponse.json({ ...job, subtasks });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { agent_id, reason } = await req.json() as { agent_id?: string; reason?: string };
    if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 });
    const result = await slashAgent(agent_id, id, reason ?? 'Output flagged by requester');
    return NextResponse.json({ slashed: true, slashedAmount: result.slashed, newBond: result.newBond });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
