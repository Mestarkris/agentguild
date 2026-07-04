require('dotenv').config({ path: require('path').join(__dirname, '../../orchestrator/.env') });
const express = require('express');
const cors = require('cors');
const { chatComplete } = require('../../shared/groq');

// Per-skill max_tokens caps — tuned to actual output lengths, not "just in case 1024".
const MAX_TOKENS_BY_SKILL = {
  sentiment:      200,
  sql:            400,
  chart:          400,
  extract:        400,
  'fact-check':   400,
  transcribe:     512,
  summarizer:     512,
  translate:      512,
  finance:        600,
  'legal-review': 700,
  'code-review':  700,
  research:       700,
};

function createAgentServer({ name, skill, port, systemPrompt, priceUsdc, buildPrompt, max_tokens }) {
  const effectiveMaxTokens = max_tokens ?? MAX_TOKENS_BY_SKILL[skill] ?? 512;
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

    const userMessage = buildPrompt ? buildPrompt(prompt, context) : prompt;
    const start = Date.now();

    let result, servedBy, tokensUsed;
    try {
      ({ text: result, servedBy, tokensUsed } = await chatComplete({
        callerLabel: name,
        system: systemPrompt,
        max_tokens: effectiveMaxTokens,
        messages: [{ role: 'user', content: userMessage }],
      }));
    } catch (llmErr) {
      console.error(`[${name}] LLM call failed: ${llmErr.message}`);
      return res.status(500).json({ error: llmErr.message, qualityScore: 0 });
    }

    const elapsed = Date.now() - start;
    const qualityScore = Math.min(1.0, Math.max(0.3,
      result.length > 50 ? 1.0 - (elapsed > 10000 ? 0.2 : 0) : 0.5
    ));

    res.json({ result, tokensUsed, qualityScore, elapsed, servedBy });
  });

  app.listen(port, () => console.log(`[${name}] Ready on http://localhost:${port} · provider: groq/llama-3.3-70b-versatile`));
  return app;
}

module.exports = { createAgentServer };
