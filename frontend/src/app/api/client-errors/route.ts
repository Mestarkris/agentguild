import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      boundary: string;
      message: string;
      stack?: string;
      digest?: string;
      url?: string;
    };
    // Logs appear in Vercel Runtime Logs → visible via `vercel logs`
    console.error('[ClientError]', JSON.stringify({
      boundary: body.boundary,
      message: body.message,
      digest: body.digest ?? null,
      url: body.url ?? null,
      stack: body.stack?.split('\n').slice(0, 6).join('\n') ?? null,
    }));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
