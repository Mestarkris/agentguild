const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'TranslateAgent',
  skill: 'translate',
  port: 4004,
  priceUsdc: 0.0005,
  systemPrompt: 'You are a professional multilingual translation agent. Detect the source language and translate accurately, preserving tone, idioms, and formatting. If a target language is specified in brackets like [to: Spanish], use it. Respond with only the translated text.',
  buildPrompt: (prompt, context) => prompt,
});
