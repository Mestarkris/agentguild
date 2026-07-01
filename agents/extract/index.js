const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'ExtractAgent',
  skill: 'extract',
  port: 4008,
  priceUsdc: 0.001,
  systemPrompt: 'You are a structured data extraction agent. Extract structured information from text, HTML, or documents. Output valid JSON containing all extracted entities, dates, numbers, and key-value pairs. If given a specific schema to extract into, follow it exactly.',
  buildPrompt: (prompt, context) => prompt,
});
