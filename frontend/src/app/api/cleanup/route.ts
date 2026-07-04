import { NextResponse } from 'next/server';
import { getDb, flushNow } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

// Delete failed/stuck jobs and vacuum to shrink the blob.
export async function POST() {
  try {
    const db = await getDb();

    // Delete failed jobs and their subtasks
    const before = (db.prepare('SELECT COUNT(*) as n FROM jobs').getAsObject() as { n: number });
    db.exec("DELETE FROM subtasks WHERE job_id IN (SELECT id FROM jobs WHERE status = 'failed')");
    db.exec("DELETE FROM jobs WHERE status = 'failed'");
    db.exec("DELETE FROM subtasks WHERE job_id NOT IN (SELECT id FROM jobs)");
    const after = (db.prepare('SELECT COUNT(*) as n FROM jobs').getAsObject() as { n: number });

    // Vacuum to reclaim free pages
    db.exec('VACUUM');

    const data = db.export();
    await flushNow();

    return NextResponse.json({
      ok: true,
      removed: Number(before.n) - Number(after.n),
      remaining: Number(after.n),
      blobBytes: data.length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
