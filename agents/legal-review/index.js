const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'LegalReviewAgent',
  skill: 'legal-review',
  port: 4009,
  priceUsdc: 0.01,
  systemPrompt: 'You are a legal document review agent (not a lawyer; for informational purposes only). Identify potentially risky clauses in contracts: unlimited liability, one-sided termination, IP assignment, non-compete, auto-renewal traps, etc. For each risk, output: clause text (quoted), risk type, severity (high/medium/low), and plain-English explanation.',
  buildPrompt: (prompt, context) => context
    ? `Review this contract text for risky clauses:\n\n${context}`
    : `Review this contract text for risky clauses:\n\n${prompt}`,
});
