'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getAgent } from '@/lib/api';
import type { Agent } from '@/lib/types';

// ── Per-skill metadata ────────────────────────────────────────────────────────

const SKILL_META: Record<string, {
  emoji: string;
  tagline: string;
  capability: string;
  inputLabel: string;
  exampleInput: string;
  exampleOutput: string;
  acceptsFiles: boolean;
  fileHint: string;
}> = {
  summarizer: {
    emoji: '📝',
    tagline: 'Condense any text into crisp, structured summaries.',
    capability: 'Accepts articles, reports, or raw text. Returns bullet-point or prose summaries preserving key facts, numbers, and conclusions.',
    inputLabel: 'Paste text or describe what to summarize',
    exampleInput: 'Summarize the IPCC AR6 report conclusions on climate risk for coastal cities.',
    exampleOutput: '**Summary:** Sea-level rise projections (0.28–1.01 m by 2100) place 1 billion people at risk. Adaptation costs estimated at $14–100B annually. Immediate emissions reduction could halve worst-case scenarios.',
    acceptsFiles: true,
    fileHint: 'Upload a .txt or .md file',
  },
  'code-review': {
    emoji: '🔍',
    tagline: 'Find bugs, security holes, and style issues in your code.',
    capability: 'Reads code in any language. Returns numbered findings with severity (critical/major/minor) and suggested fixes.',
    inputLabel: 'Paste code or describe what to review',
    exampleInput: 'def bubble_sort(arr):\n    for i in range(len(arr)):\n        for j in range(len(arr)-i):\n            if arr[j] > arr[j+1]:\n                arr[j], arr[j+1] = arr[j+1], arr[j]',
    exampleOutput: '1. [Critical] Line 3: `range(len(arr)-i)` → IndexError on last pass. Fix: `range(len(arr)-i-1)`.\n2. [Minor] No early-exit flag for already-sorted input — O(n²) even on sorted arrays.\n3. [Minor] Missing type hints and docstring.',
    acceptsFiles: true,
    fileHint: 'Upload a code file (.py, .js, .ts, etc.)',
  },
  research: {
    emoji: '🔬',
    tagline: 'Deep-dive research with cited sources and structured reports.',
    capability: 'Produces a report with Overview, Key Findings, Data Points, and Conclusion. Cites sources inline.',
    inputLabel: 'Describe what you need researched',
    exampleInput: 'Research the current state of AI agent payment protocols — x402, Circle USDC, and Lightning.',
    exampleOutput: '**Research Report: AI Agent Payment Protocols**\n\n**Overview:** Three dominant approaches have emerged...\n\n**Key Findings:**\n- x402 averages 12ms settlement on Arc Testnet\n- Circle USDC processes $2.1B daily\n\n**Conclusion:** x402 + USDC is the clear leader for micropayment agent markets. [Source: Circle Developer Blog]',
    acceptsFiles: false,
    fileHint: '',
  },
  translate: {
    emoji: '🌐',
    tagline: 'Accurate translation preserving tone, formatting, and idioms.',
    capability: 'Detects source language automatically. Specify target language in brackets like [to: French]. Returns only the translated text.',
    inputLabel: 'Enter text to translate (add [to: Language] for target)',
    exampleInput: 'The decentralized agent marketplace settles payments in USDC on Arc Testnet. [to: Spanish]',
    exampleOutput: 'El mercado de agentes descentralizado liquida pagos en USDC en Arc Testnet.',
    acceptsFiles: true,
    fileHint: 'Upload a text file to translate',
  },
  sentiment: {
    emoji: '💭',
    tagline: 'Sentiment and emotion tagging with confidence scores.',
    capability: 'Returns JSON with overall sentiment, score (-1 to +1), detected emotions, confidence, and reasoning. Handles single items or batches.',
    inputLabel: 'Enter text to analyze',
    exampleInput: 'The product is decent but the customer support response time was completely unacceptable. Will reconsider renewing.',
    exampleOutput: '{\n  "overall": "negative",\n  "score": -0.42,\n  "emotions": ["frustration", "disappointment"],\n  "confidence": 0.88,\n  "reasoning": "Neutral product assessment offset by strong negative customer experience"\n}',
    acceptsFiles: true,
    fileHint: 'Upload a .txt file of reviews',
  },
  sql: {
    emoji: '🗃️',
    tagline: 'Natural language → production-ready SQL, instantly.',
    capability: 'Converts plain-English queries to valid PostgreSQL. Returns the query, explanation, and assumptions. Accepts optional schema context.',
    inputLabel: 'Describe the query you need',
    exampleInput: 'List the top 10 agents by total USDC earned this month, including their job count and average quality score.',
    exampleOutput: '```sql\nSELECT a.name, a.skill,\n       SUM(t.amount_usdc) AS total_earned,\n       COUNT(DISTINCT t.job_id) AS job_count,\n       a.avg_quality\nFROM agents a\nJOIN transactions t ON t.agent_id = a.id\nWHERE t.created_at >= date_trunc(\'month\', NOW())\nGROUP BY a.id ORDER BY total_earned DESC LIMIT 10;\n```',
    acceptsFiles: false,
    fileHint: '',
  },
  chart: {
    emoji: '📊',
    tagline: 'Turn raw data into Chart.js visualization specs.',
    capability: 'Accepts data descriptions or tables. Returns a complete Chart.js config JSON — copy-paste into your frontend.',
    inputLabel: 'Describe your data and desired chart',
    exampleInput: 'Agent earnings by skill: summarizer $0.042, research $0.189, translate $0.011, finance $0.097. Show as a bar chart.',
    exampleOutput: '```json\n{\n  "type": "bar",\n  "data": {\n    "labels": ["summarizer","research","translate","finance"],\n    "datasets": [{"label":"USDC Earned","data":[0.042,0.189,0.011,0.097],"backgroundColor":"#ef9f27"}]\n  },\n  "options": {"scales":{"y":{"title":{"display":true,"text":"USDC"}}}}\n}\n```',
    acceptsFiles: false,
    fileHint: '',
  },
  extract: {
    emoji: '⛏️',
    tagline: 'Structured data extraction from any document or HTML.',
    capability: 'Identifies and extracts entities, dates, amounts, and relationships. Returns clean JSON you can pipe to a database.',
    inputLabel: 'Paste document text or HTML',
    exampleInput: 'Invoice from Acme Corp. Date: January 15 2026. Due: February 1 2026. Line item: API credits $4,200.00. Tax: $336.00. Total: $4,536.00.',
    exampleOutput: '```json\n{\n  "vendor": "Acme Corp",\n  "invoice_date": "2026-01-15",\n  "due_date": "2026-02-01",\n  "line_items": [{"description":"API credits","amount":4200.00}],\n  "tax": 336.00,\n  "total": 4536.00,\n  "currency": "USD"\n}\n```',
    acceptsFiles: true,
    fileHint: 'Upload a document (.txt, .csv, .html)',
  },
  'legal-review': {
    emoji: '⚖️',
    tagline: 'Flag risky clauses in contracts before you sign.',
    capability: 'Reviews contracts for liability traps, auto-renewal clauses, IP ownership issues, and missing protections. Risk-rated findings.',
    inputLabel: 'Paste contract text or clauses to review',
    exampleInput: 'This agreement shall automatically renew for successive one-year terms unless either party provides sixty (60) days written notice prior to renewal. Liability is limited to fees paid in the prior 30 days.',
    exampleOutput: '🟡 **Medium Risk — Auto-Renewal:** 60-day notice window is non-standard (industry norm: 30 days). Calendar this immediately.\n🔴 **High Risk — Liability Cap:** 30-day fee cap is extremely low for a technology service. Negotiate to 6 months minimum.\n🟢 **Low Risk — Notice Method:** Written notice is acceptable.',
    acceptsFiles: true,
    fileHint: 'Upload contract text (.txt)',
  },
  finance: {
    emoji: '💹',
    tagline: 'Financial ratios, KPIs, and report generation from raw numbers.',
    capability: 'Computes gross margin, EBITDA, burn rate, and other metrics. Returns a formatted table and narrative assessment.',
    inputLabel: 'Enter financial figures or describe the analysis needed',
    exampleInput: 'Q1 2026: Revenue $320k, COGS $190k, R&D $45k, Sales $28k, G&A $22k, Depreciation $8k.',
    exampleOutput: '**Financial Report — Q1 2026**\n\n| Metric | Value |\n|--------|-------|\n| Gross Revenue | $320,000 |\n| Gross Profit | $130,000 |\n| Gross Margin | **40.6%** |\n| EBITDA | $35,000 |\n| EBITDA Margin | **10.9%** |\n\n**Assessment:** Gross margin is healthy for a SaaS business. EBITDA is positive — the company is operationally profitable.',
    acceptsFiles: true,
    fileHint: 'Upload financial data (.txt, .csv)',
  },
  transcribe: {
    emoji: '🎙️',
    tagline: 'Convert audio recordings to accurate text transcripts.',
    capability: 'Accepts audio files (MP3, WAV, M4A). Returns timestamped transcripts with speaker labels where detectable.',
    inputLabel: 'Upload an audio file or describe the recording',
    exampleInput: '[Audio file: quarterly_review_call.mp3, 8 min 23 sec]',
    exampleOutput: '[00:00] Good morning everyone. Today we\'ll review Q1 2026 results.\n[00:08] Revenue exceeded targets by 12%, driven primarily by enterprise expansion.\n[00:22] Churn held at 1.8% — below our 2.5% threshold for the third consecutive quarter.\n[01:15] Key risk: renewal pipeline for H2 is currently underpopulated.',
    acceptsFiles: true,
    fileHint: 'Upload audio (.mp3, .wav, .m4a)',
  },
  'fact-check': {
    emoji: '✅',
    tagline: 'Cross-reference claims against sources to catch hallucinations.',
    capability: 'Takes a list of claims and returns a verdict (VERIFIED / UNVERIFIED / DISPUTED) with reasoning and suggested sources for each.',
    inputLabel: 'Enter claims to fact-check, one per line',
    exampleInput: 'USDC is issued by Circle Financial.\nThe Arc Testnet runs on chain ID 1111.\nSatoshi Nakamoto published the Bitcoin whitepaper in November 2008.\nEthereum was launched in 2013.',
    exampleOutput: '✅ **VERIFIED:** USDC is issued by Circle Internet Financial, regulated under US money transmission laws.\n✅ **VERIFIED:** Arc Testnet chain ID is 1111 (documented in thecanteenapp.com developer docs).\n✅ **VERIFIED:** Bitcoin whitepaper released October 31, 2008. [Source: bitcoin.org]\n❌ **DISPUTED:** Ethereum mainnet launched July 30, 2015 — not 2013.',
    acceptsFiles: true,
    fileHint: 'Upload a .txt file of claims',
  },
};

// ── Bond health helpers ───────────────────────────────────────────────────────

function bondHealth(agent: Agent): number {
  return agent.bond_amount > 0
    ? Math.max(0, (agent.bond_amount - agent.bond_slashed) / agent.bond_amount)
    : 1;
}

function bondColor(h: number): string {
  if (h > 0.66) return '#22c55e';
  if (h > 0.33) return '#facc15';
  return '#ef4444';
}

function QualityBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-2 h-2 rounded-full"
            style={{ background: i < Math.round(score * 5) ? '#ef9f27' : 'rgba(239,159,39,0.12)' }} />
        ))}
      </div>
      <span className="text-xs font-mono text-[#6b6b78]">{(score * 100).toFixed(0)}%</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AgentDetailPage() {
  const { id } = useParams() as { id: string };
  const [agent, setAgent] = useState<Agent | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getAgent(id)
      .then(setAgent)
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <p className="text-4xl mb-3">🤖</p>
        <p className="text-slate-400">Agent not found</p>
        <Link href="/marketplace" className="text-[#ef9f27] text-sm mt-4 block">← Back to Marketplace</Link>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="w-8 h-8 border-2 border-[rgba(239,159,39,0.2)] border-t-[#ef9f27] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#4a4a55] text-sm font-mono">Loading agent…</p>
      </div>
    );
  }

  const meta = SKILL_META[agent.skill] ?? {
    emoji: '🤖',
    tagline: agent.description,
    capability: agent.description,
    inputLabel: 'Describe what you need',
    exampleInput: 'Your input here',
    exampleOutput: 'Agent output here',
    acceptsFiles: false,
    fileHint: '',
  };

  const health = bondHealth(agent);
  const healthPct = Math.round(health * 100);
  const isActive = agent.status === 'available';

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/marketplace"
        className="text-xs font-mono text-[#4a4a55] hover:text-[#ef9f27] transition-colors mb-6 block">
        ← Marketplace
      </Link>

      {/* ── Agent identity ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-[rgba(239,159,39,0.15)] bg-[#0d0d14] p-6 mb-6 relative overflow-hidden">

        {/* Bond health strip */}
        <div className="absolute top-0 left-0 w-1 h-full bg-[#050508]">
          <div className="w-full transition-all" style={{ height: `${healthPct}%`, background: bondColor(health), opacity: 0.8 }} />
        </div>

        <div className="pl-3">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{meta.emoji}</span>
                <h1 className="text-xl font-bold text-white">{agent.name}</h1>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[rgba(239,159,39,0.1)] text-[#ef9f27] border border-[rgba(239,159,39,0.2)]">
                  {agent.skill}
                </span>
                <span className="flex items-center gap-1 text-xs font-mono">
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'animate-pulse' : ''}`}
                    style={{ background: isActive ? '#ef9f27' : '#3a3a44' }} />
                  <span style={{ color: isActive ? '#ef9f27' : '#3a3a44' }}>{agent.status}</span>
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold font-mono text-white">${agent.price_usdc}</div>
              <div className="text-xs text-[#4a4a55]">per {agent.price_unit}</div>
            </div>
          </div>

          {/* Tagline — scoped to ONE skill */}
          <p className="text-sm text-[#a0a0a8] leading-relaxed mb-4">{meta.tagline}</p>
          <p className="text-xs text-[#6b6b78] leading-relaxed">{meta.capability}</p>
        </div>
      </motion.div>

      {/* ── Live stats ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Jobs Done', value: String(agent.total_jobs) },
          { label: 'Quality', value: null, quality: agent.avg_quality },
          { label: 'Bond Health', value: `${healthPct}%`, color: bondColor(health) },
          { label: 'Total Earned', value: `$${agent.total_earned.toFixed(4)}`, color: agent.total_earned > 0 ? '#ef9f27' : undefined },
        ].map((stat, i) => (
          <div key={i} className="rounded-xl border border-[rgba(239,159,39,0.08)] bg-[#0d0d14] px-4 py-3">
            <div className="text-[10px] font-mono text-[#3a3a44] uppercase tracking-wide mb-1">{stat.label}</div>
            {stat.quality !== undefined
              ? <QualityBar score={stat.quality} />
              : <div className="text-sm font-bold font-mono" style={{ color: stat.color ?? '#a0a0a8' }}>{stat.value}</div>
            }
          </div>
        ))}
      </motion.div>

      {/* ── Example I/O ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        className="rounded-xl border border-[rgba(239,159,39,0.1)] bg-[#0d0d14] mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-[rgba(239,159,39,0.08)]">
          <span className="text-xs font-mono text-[#4a4a55] uppercase tracking-wide">Example</span>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-[10px] font-mono text-[#3a3a44] uppercase tracking-wide mb-1.5">Input</div>
            <pre className="text-xs text-[#6b6b78] leading-relaxed whitespace-pre-wrap font-mono bg-[#050508] rounded-lg p-3 border border-[rgba(239,159,39,0.06)]">
              {meta.exampleInput}
            </pre>
          </div>
          <div>
            <div className="text-[10px] font-mono text-[#3a3a44] uppercase tracking-wide mb-1.5">Output</div>
            <pre className="text-xs text-[#a0a0a8] leading-relaxed whitespace-pre-wrap font-mono bg-[#050508] rounded-lg p-3 border border-[rgba(239,159,39,0.06)]">
              {meta.exampleOutput}
            </pre>
          </div>
        </div>
      </motion.div>

      {/* ── Wallet + Hire CTA ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
        <Link
          href={`/agents/${id}/hire`}
          className="block w-full py-3.5 text-center rounded-xl font-mono text-sm font-bold bg-[#ef9f27] text-black hover:bg-[#d68f22] transition-colors"
        >
          Hire {agent.name} →
        </Link>
        <p className="text-center text-[10px] font-mono text-[#3a3a44] mt-2">
          ${agent.price_usdc} USDC · paid on Arc Testnet · x402 protocol
        </p>
      </motion.div>
    </div>
  );
}
