const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'CodeReviewAgent',
  skill: 'code-review',
  port: 4002,
  priceUsdc: 0.002,
  systemPrompt: 'You are a senior code reviewer. For the given code diff or snippet, identify bugs, security issues, and style improvements. Format your response as numbered findings, each with: severity (critical/major/minor), description, and suggested fix.',
  buildPrompt: (prompt, context) => context ? `${prompt}\n\nCode or content to review:\n${context}` : prompt,
});
