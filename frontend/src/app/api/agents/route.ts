import { NextResponse } from 'next/server';
import { query } from '@/lib/server/db';
import { ensureSeeded } from '@/lib/server/seed';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureSeeded();
    const agents = await query('SELECT * FROM agents ORDER BY skill, name');
    return NextResponse.json(agents);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
