import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { v4 as uuidv4 } from 'uuid';
import { query, exec, flushNow } from '@/lib/server/db';
import { ensureSeeded } from '@/lib/server/seed';
import { runDirectJob } from '@/lib/server/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Skills that can meaningfully process uploaded text/doc content
const DOC_CAPABLE_SKILLS = new Set([
  'summarizer', 'code-review', 'research', 'translate', 'sentiment',
  'extract', 'legal-review', 'finance', 'transcribe', 'fact-check',
]);

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();

    let agentId: string;
    let description: string;
    let payerAddress: string | undefined;
    let buyerTx: string | undefined;

    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      agentId = (form.get('agentId') as string | null) ?? '';
      description = (form.get('description') as string | null) ?? '';
      payerAddress = (form.get('payer_address') as string | null) ?? undefined;
      buyerTx = (form.get('buyer_tx') as string | null) ?? undefined;
      const file = form.get('file') as File | null;

      if (file && file.size > 0) {
        const mime = file.type.toLowerCase();
        const filename = file.name;

        if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(filename)) {
          // Audio: force TranscribeAgent
          const transcribeRows = await query("SELECT id FROM agents WHERE skill = 'transcribe' LIMIT 1");
          if (transcribeRows[0]) agentId = transcribeRows[0].id as string;
          description = description
            ? `Transcribe this audio file (${filename}) and also: ${description}`
            : `Transcribe the provided audio recording: ${filename}`;
        } else {
          // Text/doc/pdf: read text if possible and prepend to description
          let fileText = '';
          try {
            if (mime === 'text/plain' || mime === 'text/csv' || mime.includes('javascript') || mime.includes('typescript') || /\.(txt|csv|md|js|ts|py|json|xml|html|css)$/i.test(filename)) {
              fileText = await file.text();
              if (fileText.length > 8000) fileText = fileText.slice(0, 8000) + '\n[truncated]';
            }
          } catch { /* non-text file */ }

          // If current agent can't handle docs (sql/chart), switch to extract
          const agentRows = await query('SELECT skill FROM agents WHERE id = ?', [agentId]);
          const currentSkill = agentRows[0]?.skill as string ?? '';
          if (!DOC_CAPABLE_SKILLS.has(currentSkill)) {
            const extractRows = await query("SELECT id FROM agents WHERE skill = 'extract' LIMIT 1");
            if (extractRows[0]) agentId = extractRows[0].id as string;
          }

          const fileContext = fileText
            ? `File: ${filename}\n\n${fileText}`
            : `File uploaded: ${filename}`;
          description = description
            ? `${description}\n\n${fileContext}`
            : fileContext;
        }
      }
    } else {
      const body = await req.json() as { agentId?: string; description?: string; payer_address?: string; buyer_tx?: string };
      agentId = body.agentId ?? '';
      description = body.description ?? '';
      payerAddress = body.payer_address;
      buyerTx = body.buyer_tx;
    }

    if (!agentId?.trim()) return NextResponse.json({ error: 'agentId required' }, { status: 400 });
    if (!description?.trim()) return NextResponse.json({ error: 'description required' }, { status: 400 });

    const agentRows = await query('SELECT * FROM agents WHERE id = ?', [agentId]);
    if (!agentRows[0]) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const jobId = uuidv4();
    await exec(
      "INSERT INTO jobs (id, description, status, job_type, direct_agent_id, buyer_tx) VALUES (?, ?, 'pending', 'direct', ?, ?)",
      [jobId, description.trim(), agentId, buyerTx ?? null]
    );
    await flushNow();

    waitUntil((async () => {
      try {
        await runDirectJob(jobId, description.trim(), agentId);
      } catch (err) {
        console.error(`[DirectJob ${jobId}] Fatal:`, (err as Error).message);
        try {
          await exec('UPDATE jobs SET status = ?, error = ? WHERE id = ?', ['failed', (err as Error).message, jobId]);
          await flushNow();
        } catch { /* ignore */ }
      }
    })());

    return NextResponse.json({ jobId, status: 'pending', agentId, message: 'Direct hire job accepted' });
  } catch (err) {
    console.error('[DirectJob POST] Error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
