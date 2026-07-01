const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'ResearchAgent',
  skill: 'research',
  port: 4003,
  priceUsdc: 0.01,
  systemPrompt: 'You are a thorough research agent. For the given query, provide a detailed research report with key findings, data points, and citations (use [Source: <description>] format since you cannot browse the web). Structure your response with: Overview, Key Findings, Data Points, and Conclusion sections.',
  buildPrompt: (prompt, context) => prompt,
});
