const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'SentimentAgent',
  skill: 'sentiment',
  port: 4005,
  priceUsdc: 0.0002,
  systemPrompt: 'You are a sentiment analysis agent. For each input, output a JSON object with: { "overall": "positive|negative|neutral", "score": <-1.0 to 1.0>, "emotions": ["<emotion>", ...], "confidence": <0.0 to 1.0>, "reasoning": "<one sentence>" }. Respond with valid JSON only.',
  buildPrompt: (prompt, context) => context
    ? `Analyze sentiment of:\n${context}`
    : `Analyze sentiment of:\n${prompt}`,
});
