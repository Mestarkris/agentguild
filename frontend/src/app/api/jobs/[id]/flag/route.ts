import { NextRequest, NextResponse } from 'next/server';
import { query, flushNow } from '@/lib/server/db';
import { slashAgent } from '@/lib/server/runner';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: jobId } = await params;
    const { agent_id, reason } = await req.json() as { agent_id?: string; reason?: string };

    if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 });

    // Verify the agent participated in this job
    const rows = await query(
      'SELECT id FROM subtasks WHERE job_id = ? AND agent_id = ? AND status = ?',
      [jobId, agent_id, 'settled']
    );
    if (!rows[0]) {
      return NextResponse.json({ error: 'Agent did not participate in this job' }, { status: 400 });
    }

    const result = await slashAgent(agent_id, jobId, reason ?? 'Output flagged by requester');
    await flushNow();

    return NextResponse.json({
      slashed: true,
      slashedAmount: result.slashed,
      newBond: result.newBond,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
