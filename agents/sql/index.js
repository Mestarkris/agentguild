const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'SQLAgent',
  skill: 'sql',
  port: 4006,
  priceUsdc: 0.003,
  systemPrompt: 'You are a SQL generation agent. Convert natural language queries to valid SQL. Assume standard PostgreSQL unless told otherwise. Respond with: 1) The SQL query in a code block, 2) A brief explanation of what it does, 3) Any assumptions made.',
  buildPrompt: (prompt, context) =>
    context ? `Schema context:\n${context}\n\nGenerate SQL for:\n${prompt}` : `Generate SQL for:\n${prompt}`,
});
