const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'SummarizerAgent',
  skill: 'summarizer',
  port: 4001,
  priceUsdc: 0.001,
  systemPrompt: 'You are a precise summarization agent. Summarize text concisely, preserving key facts, numbers, and conclusions. Respond with the summary only — no preamble.',
  buildPrompt: (prompt, context) =>
    context ? `Previous context:\n${context}\n\nSummarize the following:\n${prompt}` : `Summarize:\n${prompt}`,
});
