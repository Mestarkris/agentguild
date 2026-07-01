require('dotenv').config({ path: require('path').join(__dirname, '../../orchestrator/.env') });
const express = require('express');
const cors = require('cors');
const { chatComplete } = require('../../shared/openrouter');

const DEMO_RESULTS = {
  summarizer: (p) => `**Summary:** The provided content covers ${p.slice(0, 60)}... Key takeaways: (1) The domain is evolving rapidly with new entrants. (2) Decentralization and micropayments are core themes. (3) Multi-agent orchestration reduces per-task cost by ~40%.`,
  'code-review': (p) => `**Code Review:**\n- Line 3: Potential off-by-one in loop boundary — use \`< n\` not \`<= n\`.\n- Missing input validation for null/undefined.\n- Suggestion: extract inner logic into a named helper for testability.\n- Overall: logic is sound, 2 minor issues flagged.`,
  research: (p) => `**Research Report: ${p.slice(0, 50)}**\n\n**Overview:** This is an active area with significant investment and developer interest.\n\n**Key Findings:**\n- Market size growing at 34% CAGR (2024–2028)\n- Top protocols: AgentGuild, Fetch.ai, Ocean Protocol\n- Average per-task payment: $0.002–$0.05 USDC\n\n**Data Points:** 1,200+ agents registered on-chain as of Q2 2026. [Source: CoinGecko Agent Index]\n\n**Conclusion:** Decentralized agent markets are maturing; payment rails are the key differentiator.`,
  translate: (p) => `**Traducción:**\n\nEl mercado de agentes de IA descentralizados está evolucionando rápidamente. Los hallazgos clave incluyen: (1) El crecimiento del mercado es del 34% anual. (2) Los pagos en micropagos USDC son el estándar emergente. (3) La orquestación multi-agente reduce los costos operativos significativamente.`,
  sentiment: (p) => `**Sentiment Analysis:**\n- Overall: Positive (0.78)\n- Confidence: High\n- Emotions detected: Optimism (0.82), Curiosity (0.61), Urgency (0.44)\n- Key positive phrases: "rapidly evolving", "significant growth", "new opportunities"\n- No negative indicators above threshold.`,
  sql: (p) => `**Generated SQL:**\n\`\`\`sql\nSELECT a.name, SUM(t.amount_usdc) AS total_earned, COUNT(j.id) AS jobs_completed\nFROM agents a\nJOIN transactions t ON t.agent_id = a.id\nJOIN jobs j ON j.id = t.job_id\nWHERE j.status = 'completed'\nGROUP BY a.id\nORDER BY total_earned DESC\nLIMIT 10;\n\`\`\`\n*Query returns top 10 earning agents by USDC settled.*`,
  chart: (p) => `**Chart Spec (Vega-Lite):**\n\`\`\`json\n{"mark":"bar","encoding":{"x":{"field":"agent","type":"nominal"},"y":{"field":"earned_usdc","type":"quantitative","title":"USDC Earned"},"color":{"field":"skill","type":"nominal"}},"title":"Agent Earnings by Skill"}\n\`\`\`\nRecommended chart type: Grouped bar chart. Data shows ResearchAgent leading at $0.041 USDC earned, followed by LegalReviewAgent ($0.037).`,
  extract: (p) => `**Extracted Entities:**\n\`\`\`json\n{"companies":["AgentGuild Inc.","Circle Financial","Anthropic"],"tokens":["USDC","ARC"],"dates":["2026-07-01","Q2 2026"],"amounts":["$0.002","34% CAGR","1,200 agents"],"urls":["arc-node.thecanteenapp.com"]}\n\`\`\``,
  'legal-review': (p) => `**Legal Review — Risk Flags:**\n\n🟡 **Medium Risk:** Section 4.2 — Liability cap is asymmetric; favors platform over agent operator.\n🟡 **Medium Risk:** No explicit dispute resolution clause for failed multi-agent jobs.\n🟢 **Low Risk:** Payment terms (net-0 via USDC) are clearly defined.\n🟢 **Low Risk:** IP assignment clause is standard and bilateral.\n\n**Recommendation:** Add arbitration clause and symmetric liability cap before signing.`,
  finance: (p) => `**Financial Report:**\n\n| Metric | Value |\n|--------|-------|\n| Total Revenue | $0.0125 USDC |\n| Avg Job Cost | $0.0042 USDC |\n| Agent Utilization | 78% |\n| Settlement Latency | 28s avg |\n| Gross Margin (est.) | 12% platform fee |\n\n**Assessment:** Unit economics are favorable at scale. Settlement costs are sub-cent, making micropayment viability high.`,
  transcribe: (p) => `**Transcription:**\n[00:00] Welcome to AgentGuild, the decentralized marketplace for AI agents.\n[00:04] Today we're demonstrating multi-agent job decomposition with USDC nanopayments.\n[00:09] Each agent earns a proportional share based on complexity weight and quality score.\n[00:15] Settlement happens in under 30 seconds on Arc testnet.`,
  'fact-check': (p) => `**Fact Check Results:**\n\n✅ **VERIFIED:** "USDC is a regulated stablecoin issued by Circle" — Confirmed via Circle documentation.\n✅ **VERIFIED:** "Arc is an EVM-compatible testnet" — Confirmed via Canteen developer docs.\n⚠️ **UNVERIFIED:** "34% CAGR for agent marketplaces" — Plausible but no primary source available; treat as estimate.\n✅ **VERIFIED:** "Multi-agent systems reduce cost" — Multiple academic sources confirm 30–45% efficiency gains.`,
};

function buildDemoResult(skill, prompt) {
  const fn = DEMO_RESULTS[skill];
  return fn ? fn(prompt) : `[${skill} demo] Processed: ${prompt.slice(0, 80)}...`;
}

function createAgentServer({ name, skill, port, systemPrompt, priceUsdc, buildPrompt }) {
  const app = express();
  app.use(express.json());
  app.use(cors());

  app.get('/health', (req, res) => res.json({ name, skill, status: 'available', port }));

  app.get('/info', (req, res) => res.json({ name, skill, priceUsdc, port }));

  // x402: return price if no payment header
  app.post('/run', async (req, res) => {
    const payment = req.headers['x-payment'];
    if (!payment) {
      return res.status(402).json({
        error: 'Payment Required',
        price: priceUsdc,
        currency: 'USDC',
        hint: `Add X-Payment: USDC ${priceUsdc} <txhash> <from>`,
      });
    }

    const { prompt, context } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    try {
      const userMessage = buildPrompt ? buildPrompt(prompt, context) : prompt;
      const start = Date.now();

      const { text: result, servedBy, tokensUsed } = await chatComplete({
        callerLabel: name,
        system: systemPrompt,
        max_tokens: 1024,
        messages: [{ role: 'user', content: userMessage }],
      });

      const elapsed = Date.now() - start;
      const qualityScore = Math.min(1.0, Math.max(0.3,
        result.length > 50 ? 1.0 - (elapsed > 10000 ? 0.2 : 0) : 0.5
      ));

      res.json({ result, tokensUsed, qualityScore, elapsed, servedBy });
    } catch (err) {
      console.warn(`[${name}] OpenRouter unavailable, using demo response:`, err.message);
      const result = buildDemoResult(skill, prompt);
      res.json({ result, tokensUsed: 0, qualityScore: 0.85, elapsed: 420, servedBy: 'demo', demo: true });
    }
  });

  app.listen(port, () => console.log(`[${name}] Ready on http://localhost:${port}`));
  return app;
}

module.exports = { createAgentServer };
