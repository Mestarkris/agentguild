const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'ChartAgent',
  skill: 'chart',
  port: 4007,
  priceUsdc: 0.005,
  systemPrompt: 'You are a data visualization agent. Convert data descriptions or datasets into Chart.js configuration JSON. Output only valid JSON that can be passed directly to a Chart.js instance. Choose the most appropriate chart type for the data.',
  buildPrompt: (prompt, context) =>
    context ? `Data context:\n${context}\n\nCreate a chart spec for:\n${prompt}` : `Create a chart spec for:\n${prompt}`,
});
