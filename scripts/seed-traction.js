#!/usr/bin/env node
/**
 * Seed the AgentGuild marketplace with realistic traction.
 * Submits a mix of auto-decompose and direct-hire jobs across all 12 agent skills.
 * Run: node scripts/seed-traction.js [--base-url http://localhost:3000]
 */

const BASE_URL = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : 'http://localhost:3000';

// Minimum ms between job submissions — spreads Groq token bursts across the
// per-minute rate-limit window even if a previous job finishes very quickly.
const PACE_MS = 2000;
let lastSubmitAt = 0;

async function paceSubmit() {
  const wait = PACE_MS - (Date.now() - lastSubmitAt);
  if (wait > 0) await sleep(wait);
  lastSubmitAt = Date.now();
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function waitForJob(jobId, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await sleep(2500);
    try {
      const job = await get(`/api/jobs/${jobId}`);
      if (job.status === 'completed' || job.status === 'failed') return job;
    } catch (e) {
      // 404 = stale warm lambda — reload-on-miss is in flight, keep polling
      if (!String(e.message).includes('404')) throw e;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Job definitions ─────────────────────────────────────────────────────────

const AUTO_JOBS = [
  {
    description: 'Research the current regulatory landscape for stablecoins in the US and EU, then summarize the key differences for a non-technical founder audience',
  },
  {
    description: 'Review this Python code for security issues and bugs:\n\ndef get_user(user_id):\n    conn = sqlite3.connect("db.sqlite")\n    return conn.execute(f"SELECT * FROM users WHERE id = {user_id}").fetchone()\n\nThen fact-check whether SQL injection is still the #1 OWASP risk in 2024.',
  },
  {
    description: 'Research the history and adoption curve of USDC from 2018 to 2025, extract key milestones and market cap data, then generate a bar chart spec showing quarterly market cap growth',
  },
  {
    description: 'Analyze the sentiment of these customer reviews and then write a finance KPI summary:\n"Amazing product, saved us hours every week!"\n"Support team is completely unresponsive. Will not renew."\n"Good value but the UI needs work. 3/5."\n"Best decision we made this year — highly recommend."',
  },
  {
    description: 'Research how Arc testnet differs from Ethereum mainnet for micropayments, then translate the key findings to Spanish for our Latin American developer audience',
  },
  {
    description: 'Review this Node.js code:\n\napp.get("/admin", (req, res) => {\n  const user = req.headers["x-user"];\n  if (user) res.json(adminPanel());\n});\n\nIdentify vulnerabilities, then generate a SQL query to log all admin access attempts.',
  },
  {
    description: 'Research the top 5 AI agent frameworks in 2025 (LangChain, AutoGPT, CrewAI, AgentGuild, Vertex), extract their pricing models and feature sets, then fact-check the claim that CrewAI is open source',
  },
  {
    description: 'Summarize the x402 payment protocol whitepaper concept: HTTP-native payments where a server returns 402 Payment Required with a payment address, client pays, then re-requests. Extract the core protocol fields into structured JSON.',
  },
  {
    description: 'Research the Series B funding rounds in AI infrastructure from Jan-Jun 2025, extract company names, amounts, and lead investors, then summarize the top 3 trends for a VC memo',
  },
  {
    description: 'Analyze the sentiment of this product feedback thread and then generate a Chart.js line chart spec showing satisfaction scores over time:\nWeek 1: "Great onboarding experience!" Week 2: "Encountered a few bugs, hope they get fixed" Week 3: "Bugs are fixed, loving the new features" Week 4: "Pricing increased without notice — very unhappy"',
  },
];

const DIRECT_JOBS = [
  {
    skill: 'legal-review',
    agentId: 'agent-legal-review',
    description: 'Review these clauses for risk:\n1. "The vendor may change pricing at any time with 24 hours notice via email."\n2. "All intellectual property created using the platform belongs exclusively to the platform."\n3. "This agreement is governed by the laws of the Cayman Islands, disputes resolved by binding arbitration."',
  },
  {
    skill: 'research',
    agentId: 'agent-research',
    description: 'Research the competitive landscape of AI-powered contract review tools in 2025. Who are the top players (Ironclad, LexCheck, Kira), what are their pricing models, and what is the total addressable market?',
  },
  {
    skill: 'summarizer',
    agentId: 'agent-summarizer',
    description: 'Summarize the key arguments for and against central bank digital currencies (CBDCs) as presented in the BIS 2024 annual report. Focus on privacy concerns, financial inclusion benefits, and systemic risk considerations.',
  },
  {
    skill: 'code-review',
    agentId: 'agent-code-review',
    description: 'Review this TypeScript authentication middleware:\n\nasync function authMiddleware(req, res, next) {\n  const token = req.cookies.session;\n  const user = jwt.decode(token); // not verify!\n  if (user?.role === "admin") return next();\n  res.status(403).send("Forbidden");\n}\n\nIdentify all security vulnerabilities.',
  },
  {
    skill: 'translate',
    agentId: 'agent-translate',
    description: 'Translate this product announcement to French:\n\n"AgentGuild is the first decentralized AI agent marketplace where agents are paid in USDC on Arc testnet. Each agent lists itself as an x402-priced service. The Planner automatically decomposes complex jobs, routes subtasks to specialists, and splits micropayments proportionally based on contribution."',
  },
  {
    skill: 'sentiment',
    agentId: 'agent-sentiment',
    description: 'Analyze the sentiment of these investor reactions to our Q1 2025 earnings call:\n"Revenue growth of 47% YoY exceeded our estimates significantly."\n"Gross margin compression to 61% is concerning given the competitive dynamics."\n"Management raised guidance — this is a strong signal of confidence."\n"Customer churn uptick to 3.2% warrants close monitoring next quarter."',
  },
  {
    skill: 'finance',
    agentId: 'agent-finance',
    description: 'Generate a financial analysis report for this SaaS startup:\nARR: $2.4M, MRR: $200k, MoM growth: 8.2%, Gross margin: 78%, Burn rate: $85k/month, Runway: 14 months, CAC: $1,200, LTV: $8,400, Churn: 1.8% monthly',
  },
  {
    skill: 'extract',
    agentId: 'agent-extract',
    description: 'Extract all structured data from this contract excerpt:\n\n"This Software License Agreement ("Agreement") is entered into as of March 15, 2025, between Acme Technologies Inc., a Delaware corporation ("Licensor") and DataFlow Systems LLC, a California LLC ("Licensee"). License fee: $24,000/year, payable quarterly in advance. Term: 36 months from execution date. Renewal: automatic 12-month renewal unless 90-day written notice of termination."',
  },
  {
    skill: 'fact-check',
    agentId: 'agent-fact-check',
    description: 'Fact-check these claims:\n1. The Ethereum merge reduced energy consumption by approximately 99.95%\n2. Bitcoin was created in 2008 by Satoshi Nakamoto\n3. Circle Financial was founded in 2013\n4. Stablecoins have a combined market cap exceeding $200 billion as of 2025\n5. The first NFT was minted in 2014',
  },
  {
    skill: 'sql',
    agentId: 'agent-sql',
    description: 'Generate SQL queries for an AI agent marketplace database. Schema: agents(id, name, skill, price_usdc, total_jobs, total_earned, avg_quality, bond_amount, bond_slashed), jobs(id, description, status, total_price_usdc, completed_at), subtasks(id, job_id, agent_id, tokens_used, payment_usdc). Query needed: Top 5 most profitable agents this month with their job count, earnings, and quality score.',
  },
  {
    skill: 'summarizer',
    agentId: 'agent-summarizer',
    description: 'Summarize the core thesis of the "Attention Is All You Need" transformer paper. Focus on: why self-attention replaces RNNs, what multi-head attention adds, and what the key benchmark results were on WMT 2014 English-German translation.',
  },
  {
    skill: 'legal-review',
    agentId: 'agent-legal-review',
    description: 'Review this SaaS terms of service clause for risks:\n"Provider reserves the right to modify, suspend, or discontinue any aspect of the Service at any time without notice. Provider shall not be liable to you or any third party for any modification, suspension, or discontinuance. Data export functionality may be removed at Provider\'s discretion."',
  },
  {
    skill: 'research',
    agentId: 'agent-research',
    description: 'Research the current state of zero-knowledge proof adoption in blockchain infrastructure. What are the main ZK-rollup projects (zkSync, Polygon zkEVM, StarkNet), their TPS benchmarks, and which enterprises are actively deploying on them?',
  },
  {
    skill: 'finance',
    agentId: 'agent-finance',
    description: 'Analyze these unit economics for a two-sided marketplace:\nGMV: $1.2M/month, Take rate: 12%, Net revenue: $144k/month, Payment processing: 2.9% of GMV, Customer support: $18k/month, Infrastructure: $12k/month, S&M: $45k/month. Calculate contribution margin and payback period assuming $800 average CAC.',
  },
  {
    skill: 'translate',
    agentId: 'agent-translate',
    description: 'Translate to German:\n"Our AI agents work 24/7, never take sick days, and settle their own payments on-chain. Each agent posts a reputation bond that gets slashed if they produce bad output — creating a market-driven quality signal that outperforms traditional SLAs."',
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nAgentGuild Seed Script — targeting ${BASE_URL}\n`);

  // Get registered agents to map skill → agentId
  let agents;
  try {
    agents = await get('/api/agents');
    console.log(`✓ Found ${agents.length} registered agents\n`);
  } catch (e) {
    console.error('✗ Cannot reach app:', e.message);
    process.exit(1);
  }

  const agentBySkill = {};
  for (const a of agents) agentBySkill[a.skill] = a.id;

  let completed = 0, failed = 0;
  const results = [];

  // ── Direct-hire jobs ─────────────────────────────────────────────────────
  console.log('═══ Direct-hire jobs ═══\n');
  for (let i = 0; i < DIRECT_JOBS.length; i++) {
    const job = DIRECT_JOBS[i];
    const agentId = agentBySkill[job.skill] ?? job.agentId;
    const label = `[${i + 1}/${DIRECT_JOBS.length}] direct·${job.skill}`;

    try {
      await paceSubmit();
      process.stdout.write(`${label} … `);
      const { jobId } = await post('/api/jobs/direct', {
        agentId,
        description: job.description,
        payer_address: '0xSEED_WALLET',
      });
      const result = await waitForJob(jobId);
      if (result === null) {
        console.warn(`  ⚠ timeout — job still running on server; waiting 8s before next submission`);
        await sleep(8000);
        lastSubmitAt = Date.now();
      }
      if (result?.status === 'completed') {
        completed++;
        const usdc = result.total_price_usdc?.toFixed(5) ?? '?';
        console.log(`✓  $${usdc} USDC  [${jobId.slice(0, 8)}]`);
        results.push({ type: 'direct', skill: job.skill, status: 'completed', usdc });
      } else {
        failed++;
        console.log(`✗  status=${result?.status ?? 'timeout'}`);
        results.push({ type: 'direct', skill: job.skill, status: 'failed' });
      }
    } catch (e) {
      failed++;
      console.log(`✗  ${e.message}`);
      results.push({ type: 'direct', skill: job.skill, status: 'error' });
    }

    if (i < DIRECT_JOBS.length - 1) await sleep(1200);
  }

  console.log();

  // ── Auto-decompose jobs ──────────────────────────────────────────────────
  console.log('═══ Auto-decompose jobs ═══\n');
  for (let i = 0; i < AUTO_JOBS.length; i++) {
    const job = AUTO_JOBS[i];
    const preview = job.description.slice(0, 60).replace(/\n/g, ' ');
    const label = `[${i + 1}/${AUTO_JOBS.length}] auto`;

    try {
      await paceSubmit();
      process.stdout.write(`${label} "${preview}…" → `);
      const { jobId } = await post('/api/jobs', {
        description: job.description,
        payer_address: '0xSEED_WALLET',
      });
      const result = await waitForJob(jobId, 180000);
      if (result === null) {
        console.warn(`  ⚠ timeout — job still running on server; waiting 8s before next submission`);
        await sleep(8000);
        lastSubmitAt = Date.now();
      }
      if (result?.status === 'completed') {
        completed++;
        const usdc = result.total_price_usdc?.toFixed(5) ?? '?';
        const agents_used = result.subtasks?.length ?? 0;
        console.log(`✓  $${usdc} USDC  ${agents_used} agents  [${jobId.slice(0, 8)}]`);
        results.push({ type: 'auto', status: 'completed', usdc, agents: agents_used });
      } else {
        failed++;
        console.log(`✗  status=${result?.status ?? 'timeout'}`);
        results.push({ type: 'auto', status: 'failed' });
      }
    } catch (e) {
      failed++;
      console.log(`✗  ${e.message}`);
      results.push({ type: 'auto', status: 'error' });
    }

    if (i < AUTO_JOBS.length - 1) await sleep(1500);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const totalUsdc = results
    .filter(r => r.usdc)
    .reduce((s, r) => s + parseFloat(r.usdc), 0);

  console.log('\n' + '═'.repeat(55));
  console.log(`  Completed:    ${completed}/${completed + failed} jobs`);
  console.log(`  USDC settled: $${totalUsdc.toFixed(5)}`);
  console.log(`  Failed:       ${failed}`);
  console.log('═'.repeat(55));

  // Fetch and display dashboard numbers
  try {
    const metrics = await get('/api/metrics');
    const t = metrics.totals;
    console.log('\n  Dashboard after seeding:');
    console.log(`  ├── USDC settled:    $${t.usdc_settled.toFixed(5)}`);
    console.log(`  ├── Jobs completed:  ${t.jobs_completed} / ${t.total_jobs} submitted`);
    console.log(`  ├── Agents earning:  ${t.agents_earning} / ${t.agents_registered}`);
    console.log(`  └── Avg settlement:  ${t.avg_settlement_secs.toFixed(1)}s`);

    if (metrics.leaderboard?.length) {
      console.log('\n  Top agents by earnings:');
      metrics.leaderboard.slice(0, 5).forEach((a, i) => {
        const bond = a.bond_amount > 0 ? Math.round(((a.bond_amount - a.bond_slashed) / a.bond_amount) * 100) : 100;
        console.log(`  ${i + 1}. ${a.name.padEnd(20)} $${a.total_earned.toFixed(5)}  quality=${a.avg_quality.toFixed(2)}  bond=${bond}%`);
      });
    }
  } catch { /* ignore */ }

  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
