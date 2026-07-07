import { NextRequest, NextResponse } from 'next/server';
import { query, reloadFromBlob } from '@/lib/server/db';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PDFDoc = any;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function truncateTx(tx: string) {
  if (!tx) return '';
  return `${tx.slice(0, 14)}…${tx.slice(-10)}`;
}

function renderMarkdownToPdf(doc: PDFDoc, text: string) {
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) { doc.moveDown(0.25); continue; }

    if (line.startsWith('### ')) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a2e').text(line.slice(4), { lineGap: 1 });
      doc.moveDown(0.15);
    } else if (line.startsWith('## ')) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#111111').text(line.slice(3), { lineGap: 1 });
      doc.moveDown(0.2);
    } else if (line.startsWith('# ')) {
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000').text(line.slice(2), { lineGap: 1 });
      doc.moveDown(0.25);
    } else if (line.match(/^[-•*]\s/)) {
      const content = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/`([^`]+)`/g, '$1').slice(2);
      doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a')
         .text(`•  ${content}`, { indent: 10, lineGap: 1.5 });
    } else if (line.match(/^\d+\.\s/)) {
      const content = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/`([^`]+)`/g, '$1');
      doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a')
         .text(content, { indent: 10, lineGap: 1.5 });
    } else if (line.startsWith('```')) {
      // skip code fence markers
    } else {
      const cleaned = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      if (cleaned.trim()) {
        doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a').text(cleaned, { lineGap: 2 });
      }
    }
  }
}

function sectionHeader(doc: PDFDoc, title: string) {
  const y = doc.y;
  doc.rect(50, y, 3, 16).fill('#ef9f27');
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111').text(title, 60, y);
  doc.fillColor('#1a1a1a');
  doc.moveDown(0.5);
}

function divider(doc: PDFDoc) {
  doc.moveDown(0.6);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
  doc.moveDown(0.8);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let jobRows = await query('SELECT * FROM jobs WHERE id = ?', [id]);
    if (!jobRows[0]) {
      await reloadFromBlob();
      jobRows = await query('SELECT * FROM jobs WHERE id = ?', [id]);
    }
    if (!jobRows[0]) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    const job = jobRows[0] as Record<string, unknown>;

    const subtasks = await query(
      `SELECT st.*, a.name as agent_name, a.skill
       FROM subtasks st LEFT JOIN agents a ON a.id = st.agent_id
       WHERE st.job_id = ? ORDER BY st.position`,
      [id]
    ) as Record<string, unknown>[];

    const PDFDocument = (await import('pdfkit')).default;
    const chunks: Buffer[] = [];

    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      info: {
        Title: `AgentGuild Job Report — ${id.slice(0, 8)}`,
        Author: 'AgentGuild Marketplace',
        Subject: 'AI Agent Job Report',
        CreationDate: new Date(),
      },
    });

    const endPromise = new Promise<void>((resolve) => doc.on('end', resolve));
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    // ── Branded header block ──────────────────────────────────────────────────
    doc.rect(0, 0, 595, 88).fill('#08080f');

    // AG logo box
    doc.roundedRect(46, 20, 46, 46, 5).fill('#13131f');
    doc.roundedRect(46, 20, 46, 46, 5).strokeColor('#ef9f27').lineWidth(1.5).stroke();
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#ef9f27')
       .text('AG', 46, 30, { width: 46, align: 'center' });

    // Title
    doc.fontSize(26).font('Helvetica-Bold').fillColor('#ffffff')
       .text('Agent', 103, 22, { continued: true });
    doc.fillColor('#ef9f27').text('Guild');
    doc.fontSize(9).font('Helvetica').fillColor('#aaaaaa')
       .text('Marketplace  ·  AI Agent Job Report  ·  Arc Testnet (Chain 1111)', 103, 51);
    doc.fontSize(7.5).fillColor('#666666')
       .text(`Generated ${new Date().toUTCString()}  ·  Protocol: x402  ·  Settlement: USDC`, 103, 64);

    // Status pill top-right
    const statusText = String(job.status ?? '').toUpperCase();
    const statusColor = statusText === 'COMPLETED' ? '#22c55e' : statusText === 'FAILED' ? '#ef4444' : '#ef9f27';
    doc.roundedRect(450, 28, 95, 22, 11).fill(statusColor);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff')
       .text(statusText, 450, 33, { width: 95, align: 'center' });

    doc.fillColor('#000000');
    doc.y = 105;
    doc.moveDown(0.5);

    // ── Job Request ───────────────────────────────────────────────────────────
    sectionHeader(doc, 'Job Request');

    doc.fontSize(11).font('Helvetica').fillColor('#000000')
       .text(String(job.description ?? ''), { lineGap: 3 });
    doc.moveDown(0.5);

    const jobType = String(job.job_type ?? 'auto');
    doc.fontSize(8.5).font('Helvetica').fillColor('#888888')
      .text(`Job ID: ${id}`, { continued: true })
      .text(`   ·   Type: ${jobType === 'direct' ? 'Direct Hire' : 'Auto-Decompose'}`, { continued: true })
      .text(`   ·   Submitted: ${String(job.submitted_at ?? '').slice(0, 16)} UTC`);
    if (job.completed_at) {
      doc.text(`Completed: ${String(job.completed_at).slice(0, 16)} UTC`);
    }

    divider(doc);

    // ── Agents ────────────────────────────────────────────────────────────────
    sectionHeader(doc, 'Agent(s) Involved');

    if (subtasks.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#999999').text('No subtasks recorded.');
    } else {
      for (const st of subtasks) {
        const name = String(st.agent_name ?? st.skill ?? 'Unknown Agent');
        const skill = String(st.skill ?? '');
        const stStatus = String(st.status ?? '');
        const payment = typeof st.payment_usdc === 'number' ? `$${st.payment_usdc.toFixed(6)} USDC` : '—';
        const pct = typeof st.contribution_pct === 'number' ? ` (${(st.contribution_pct * 100).toFixed(1)}%)` : '';

        // Row background for settled rows
        if (stStatus === 'settled') {
          doc.rect(50, doc.y - 2, 495, 18).fill('#fffdf0');
          doc.fillColor('#000000');
        }

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#111111')
           .text(name, { continued: true });
        doc.font('Helvetica').fillColor('#888888')
           .text(`  [${skill}]`, { continued: true });
        doc.fillColor('#ef9f27').font('Helvetica-Bold')
           .text(`  ${payment}${pct}`, { continued: false });
        doc.fillColor('#000000');

        if (st.payment_tx) {
          doc.fontSize(8).font('Courier').fillColor('#777777')
             .text(`  Tx: ${truncateTx(String(st.payment_tx))}   ${String(st.payment_tx)}`);
          doc.fillColor('#000000');
        }
        doc.moveDown(0.3);
      }
    }

    divider(doc);

    // ── Final Result ──────────────────────────────────────────────────────────
    sectionHeader(doc, 'Final Output');

    const resultText = String(job.result ?? '');
    if (resultText) {
      renderMarkdownToPdf(doc, resultText);
    } else {
      doc.fontSize(10).font('Helvetica').fillColor('#999999').text('No output recorded.');
    }

    divider(doc);

    // ── Payment & Settlement ──────────────────────────────────────────────────
    sectionHeader(doc, 'Payment & Settlement');

    const totalUsdc = typeof job.total_price_usdc === 'number' ? job.total_price_usdc : 0;
    const settled = subtasks.filter(st => st.status === 'settled');

    // Total highlight box
    doc.rect(50, doc.y, 495, 28).fill('#fffdf5');
    doc.fillColor('#000000');
    doc.fontSize(11).font('Helvetica').fillColor('#444444')
       .text('Total settled:', 60, doc.y + 8, { continued: true });
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#ef9f27')
       .text(`  $${totalUsdc.toFixed(6)} USDC`);
    doc.y += 36;
    doc.moveDown(0.3);

    doc.fontSize(8.5).font('Helvetica').fillColor('#888888')
       .text(`Network: Arc Testnet (Chain 5042002)  ·  Transactions: ${settled.length + (job.buyer_tx ? 1 : 0)}  ·  Protocol: x402`);
    doc.fillColor('#000000');

    // Buyer → Platform tx
    if (job.buyer_tx) {
      doc.moveDown(0.6);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#22c55e').text('Buyer → Platform (USDC transfer)');
      doc.fontSize(8).font('Courier').fillColor('#555555').text(`  Tx: ${String(job.buyer_tx)}`);
      doc.fontSize(7.5).font('Helvetica').fillColor('#22c55e')
         .text(`  https://testnet.arcscan.app/tx/${String(job.buyer_tx)}`);
      doc.fillColor('#000000');
    }

    if (settled.length > 0) {
      doc.moveDown(0.6);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#ef9f27').text('Platform → Agents (nanopayments)');
      doc.moveDown(0.3);
      for (const st of settled) {
        const tx = String(st.payment_tx ?? '');
        const amt = typeof st.payment_usdc === 'number' ? st.payment_usdc.toFixed(6) : '0';
        const agentName = String(st.agent_name ?? st.skill ?? '');
        doc.fontSize(9).font('Courier').fillColor('#444444')
           .text(`${agentName}`, { continued: true });
        doc.fillColor('#ef9f27').text(`  $${amt} USDC`);
        if (tx) {
          doc.fillColor('#888888').text(`  Tx: ${tx}`, { indent: 8 });
        }
        doc.fillColor('#000000');
        doc.moveDown(0.1);
      }
    }

    doc.moveDown(2);

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.rect(50, doc.y, 495, 0.5).fill('#e0e0e0');
    doc.moveDown(0.5);
    doc.fontSize(7.5).font('Helvetica').fillColor('#aaaaaa')
       .text('AgentGuild Marketplace  ·  Lepton Agents Hackathon  ·  Canteen × Circle', {
         align: 'center',
       });
    doc.fontSize(7).fillColor('#cccccc')
       .text('arc-node.thecanteenapp.com  ·  x402 protocol  ·  USDC settlement on Arc Testnet', {
         align: 'center',
       });

    doc.end();
    await endPromise;

    const pdfBuffer = Buffer.concat(chunks);
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="agentguild-job-${id.slice(0, 8)}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error('[PDF] Error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
