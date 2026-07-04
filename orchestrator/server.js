require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { getDb } = require('./db');
const { createAgentWallet } = require('./services/circle');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/agents', require('./routes/agents'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/metrics', require('./routes/metrics'));
app.use('/api/transactions', require('./routes/transactions'));

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

const AGENTS_SEED = [
  { id: 'agent-summarizer',   name: 'SummarizerAgent',   skill: 'summarizer',   description: 'Summarize text/articles', price_usdc: 0.001, price_unit: 'paragraph', base_url: 'http://localhost:4001' },
  { id: 'agent-code-review',  name: 'CodeReviewAgent',   skill: 'code-review',  description: 'Review & suggest fixes for a code diff', price_usdc: 0.002, price_unit: '10 lines', base_url: 'http://localhost:4002' },
  { id: 'agent-research',     name: 'ResearchAgent',     skill: 'research',     description: 'Web research + citation gathering', price_usdc: 0.01, price_unit: 'query', base_url: 'http://localhost:4003' },
  { id: 'agent-translate',    name: 'TranslateAgent',    skill: 'translate',    description: 'Multi-language translation', price_usdc: 0.0005, price_unit: '100 words', base_url: 'http://localhost:4004' },
  { id: 'agent-sentiment',    name: 'SentimentAgent',    skill: 'sentiment',    description: 'Sentiment/emotion tagging', price_usdc: 0.0002, price_unit: 'item', base_url: 'http://localhost:4005' },
  { id: 'agent-sql',          name: 'SQLAgent',          skill: 'sql',          description: 'Natural language → SQL', price_usdc: 0.003, price_unit: 'query', base_url: 'http://localhost:4006' },
  { id: 'agent-chart',        name: 'ChartAgent',        skill: 'chart',        description: 'Data → chart/visualization spec', price_usdc: 0.005, price_unit: 'chart', base_url: 'http://localhost:4007' },
  { id: 'agent-extract',      name: 'ExtractAgent',      skill: 'extract',      description: 'Structured data extraction from text/HTML', price_usdc: 0.001, price_unit: 'doc', base_url: 'http://localhost:4008' },
  { id: 'agent-legal-review', name: 'LegalReviewAgent',  skill: 'legal-review', description: 'Flag risky clauses in contracts', price_usdc: 0.01, price_unit: 'page', base_url: 'http://localhost:4009' },
  { id: 'agent-finance',      name: 'FinanceAgent',      skill: 'finance',      description: 'Financial ratio / report generation', price_usdc: 0.008, price_unit: 'report', base_url: 'http://localhost:4010' },
  { id: 'agent-transcribe',   name: 'TranscribeAgent',   skill: 'transcribe',   description: 'Audio → text', price_usdc: 0.002, price_unit: 'minute', base_url: 'http://localhost:4011' },
  { id: 'agent-fact-check',   name: 'FactCheckAgent',    skill: 'fact-check',   description: 'Cross-reference claims against sources', price_usdc: 0.005, price_unit: 'claim', base_url: 'http://localhost:4012' },
];

async function seedRegistry() {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as n FROM agents').get();
  if (existing.n > 0) return;

  console.log('[Seed] Seeding agent registry...');
  const insert = db.prepare(`
    INSERT OR IGNORE INTO agents (id, name, skill, description, price_usdc, price_unit, wallet_id, wallet_address, base_url, bond_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.1)
  `);

  for (const a of AGENTS_SEED) {
    const wallet = await createAgentWallet(a.id, a.name);
    insert.run(a.id, a.name, a.skill, a.description, a.price_usdc, a.price_unit,
      wallet.walletId, wallet.walletAddress, a.base_url);
    console.log(`[Seed] Registered ${a.name} (${wallet.walletAddress})`);
  }
  console.log('[Seed] Agent registry seeded.');
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`[Orchestrator] Running on http://localhost:${PORT}`);
  await seedRegistry();
});
