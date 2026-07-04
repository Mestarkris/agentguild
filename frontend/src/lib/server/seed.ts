import { query, exec, initSchema, flushNow } from './db';
import { createAgentWallet } from './circle';

const AGENTS_SEED = [
  { id: 'agent-summarizer',   name: 'SummarizerAgent',   skill: 'summarizer',   description: 'Summarize text/articles', price_usdc: 0.001, price_unit: 'paragraph' },
  { id: 'agent-code-review',  name: 'CodeReviewAgent',   skill: 'code-review',  description: 'Review & suggest fixes for a code diff', price_usdc: 0.002, price_unit: '10 lines' },
  { id: 'agent-research',     name: 'ResearchAgent',     skill: 'research',     description: 'Web research + citation gathering', price_usdc: 0.01, price_unit: 'query' },
  { id: 'agent-translate',    name: 'TranslateAgent',    skill: 'translate',    description: 'Multi-language translation', price_usdc: 0.0005, price_unit: '100 words' },
  { id: 'agent-sentiment',    name: 'SentimentAgent',    skill: 'sentiment',    description: 'Sentiment/emotion tagging', price_usdc: 0.0002, price_unit: 'item' },
  { id: 'agent-sql',          name: 'SQLAgent',          skill: 'sql',          description: 'Natural language → SQL', price_usdc: 0.003, price_unit: 'query' },
  { id: 'agent-chart',        name: 'ChartAgent',        skill: 'chart',        description: 'Data → chart/visualization spec', price_usdc: 0.005, price_unit: 'chart' },
  { id: 'agent-extract',      name: 'ExtractAgent',      skill: 'extract',      description: 'Structured data extraction from text/HTML', price_usdc: 0.001, price_unit: 'doc' },
  { id: 'agent-legal-review', name: 'LegalReviewAgent',  skill: 'legal-review', description: 'Flag risky clauses in contracts', price_usdc: 0.01, price_unit: 'page' },
  { id: 'agent-finance',      name: 'FinanceAgent',      skill: 'finance',      description: 'Financial ratio / report generation', price_usdc: 0.008, price_unit: 'report' },
  { id: 'agent-transcribe',   name: 'TranscribeAgent',   skill: 'transcribe',   description: 'Audio → text', price_usdc: 0.002, price_unit: 'minute' },
  { id: 'agent-fact-check',   name: 'FactCheckAgent',    skill: 'fact-check',   description: 'Cross-reference claims against sources', price_usdc: 0.005, price_unit: 'claim' },
];

let seeded = false;

export async function ensureSeeded() {
  if (seeded) return;
  await initSchema();
  const rows = await query('SELECT COUNT(*) as n FROM agents');
  if (Number(rows[0]?.n) > 0) { seeded = true; return; }

  console.log('[Seed] Seeding agent registry...');
  for (const a of AGENTS_SEED) {
    const wallet = await createAgentWallet(a.id, a.name);
    await exec(
      `INSERT OR IGNORE INTO agents (id, name, skill, description, price_usdc, price_unit, wallet_id, wallet_address, base_url, bond_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.1)`,
      [a.id, a.name, a.skill, a.description, a.price_usdc, a.price_unit, wallet.walletId, wallet.walletAddress, 'http://localhost']
    );
  }
  seeded = true;
  await flushNow();
  console.log('[Seed] Done: 12 agents seeded and persisted.');
}
