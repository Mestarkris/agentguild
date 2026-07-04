import { NextResponse } from 'next/server';
import { query, exec, flushNow } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

// Delete failed/stuck jobs and vacuum to shrink the blob.
export async function POST() {
  try {
    const before = await query('SELECT COUNT(*) as n FROM jobs');
    const beforeCount = Number(before[0]?.n ?? 0);

    // Remove failed subtasks and jobs
    await exec("DELETE FROM subtasks WHERE job_id IN (SELECT id FROM jobs WHERE status = 'failed')");
    await exec("DELETE FROM jobs WHERE status = 'failed'");
    await exec('DELETE FROM subtasks WHERE job_id NOT IN (SELECT id FROM jobs)');

    const after = await query('SELECT COUNT(*) as n FROM jobs');
    const afterCount = Number(after[0]?.n ?? 0);

    await flushNow();

    return NextResponse.json({
      ok: true,
      removed: beforeCount - afterCount,
      remaining: afterCount,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
