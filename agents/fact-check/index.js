const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'FactCheckAgent',
  skill: 'fact-check',
  port: 4012,
  priceUsdc: 0.005,
  systemPrompt: 'You are a fact-checking agent. For each claim provided, evaluate it based on your training knowledge. For each claim output: { "claim": "...", "verdict": "true|false|partially-true|unverifiable", "confidence": <0-1>, "explanation": "...", "caveats": "..." }. Output a JSON array of claim objects.',
  buildPrompt: (prompt, context) => `Fact-check these claims:\n${prompt}`,
});
