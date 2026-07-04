import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { v4 as uuidv4 } from 'uuid';
import { query, exec, flushNow, reloadFromBlob } from '@/lib/server/db';
import { ensureSeeded } from '@/lib/server/seed';
import { runJob } from '@/lib/server/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 5-minute dedup cache — prevents repeated test clicks from burning tokens on identical jobs
const DEDUP_TTL_MS = 5 * 60 * 1000;
const dedupCache = new Map<string, { jobId: string; ts: number }>();

export async function GET(req: NextRequest) {
  try {
    await reloadFromBlob(); // Sync from blob so warm lambdas show latest jobs
    await ensureSeeded();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50') || 50, 200);
    const search = searchParams.get('search');

    let jobs;
    if (status && status !== 'all' && search) {
      jobs = await query(
        `SELECT * FROM jobs WHERE status = ? AND description LIKE ? ORDER BY submitted_at DESC LIMIT ?`,
        [status, `%${search}%`, limit]
      );
    } else if (status && status !== 'all') {
      jobs = await query('SELECT * FROM jobs WHERE status = ? ORDER BY submitted_at DESC LIMIT ?', [status, limit]);
    } else if (search) {
      jobs = await query('SELECT * FROM jobs WHERE description LIKE ? ORDER BY submitted_at DESC LIMIT ?', [`%${search}%`, limit]);
    } else {
      jobs = await query('SELECT * FROM jobs ORDER BY submitted_at DESC LIMIT ?', [limit]);
    }
    return NextResponse.json(jobs);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const body = await req.json() as { description?: string; payer_address?: string; buyer_tx?: string };
    const { description, payer_address, buyer_tx } = body;

    if (!description?.trim()) {
      return NextResponse.json({ error: 'description required' }, { status: 400 });
    }

    const dedupKey = description.trim();
    const cached = dedupCache.get(dedupKey);
    if (cached && Date.now() - cached.ts < DEDUP_TTL_MS) {
      console.log(`[Jobs POST] Dedup hit — returning existing jobId ${cached.jobId} for identical description`);
      return NextResponse.json({ jobId: cached.jobId, status: 'pending', message: 'Duplicate request — returning existing job', dedup: true });
    }

    const jobId = uuidv4();
    dedupCache.set(dedupKey, { jobId, ts: Date.now() });
    console.log(`[Job ${jobId}] Creating — payer: ${payer_address ?? 'none'} buyer_tx: ${buyer_tx ?? 'none'}`);

    await exec(
      'INSERT INTO jobs (id, description, status, buyer_tx) VALUES (?, ?, ?, ?)',
      [jobId, description.trim(), 'pending', buyer_tx ?? null]
    );

    // Flush to Vercel Blob immediately so any subsequent lambda can read this job.
    await flushNow();
    console.log(`[Job ${jobId}] Persisted to blob, returning jobId to client`);

    waitUntil((async () => {
      try {
        console.log(`[Job ${jobId}] Background runner starting`);
        await runJob(jobId, description.trim());
        console.log(`[Job ${jobId}] Background runner complete`);
      } catch (err) {
        console.error(`[Job ${jobId}] Fatal runner error:`, (err as Error).message);
        try {
          await exec('UPDATE jobs SET status = ?, error = ? WHERE id = ?', ['failed', (err as Error).message, jobId]);
          await flushNow();
        } catch { /* ignore secondary failure */ }
      }
    })());

    return NextResponse.json({ jobId, status: 'pending', message: 'Job accepted, planning...' });
  } catch (err) {
    console.error('[Jobs POST] Error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
