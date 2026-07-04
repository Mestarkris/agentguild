import { NextResponse } from 'next/server';
import { ensureSeeded } from '@/lib/server/seed';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await ensureSeeded();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
