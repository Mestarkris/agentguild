require('dotenv').config({ path: require('path').join(__dirname, '../../orchestrator/.env') });
const express = require('express');
const cors = require('cors');
const { chatComplete } = require('../../shared/groq');

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
  });

  app.listen(port, () => console.log(`[${name}] Ready on http://localhost:${port} · provider: groq/llama-3.3-70b-versatile`));
  return app;
}

module.exports = { createAgentServer };
