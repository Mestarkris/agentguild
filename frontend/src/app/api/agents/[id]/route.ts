import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/server/db';
import { ensureSeeded } from '@/lib/server/seed';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSeeded();
    const { id } = await params;
    const rows = await query('SELECT * FROM agents WHERE id = ?', [id]);
    if (!rows[0]) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
