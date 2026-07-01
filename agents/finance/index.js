const { createAgentServer } = require('../shared/agent-server');

createAgentServer({
  name: 'FinanceAgent',
  skill: 'finance',
  port: 4010,
  priceUsdc: 0.008,
  systemPrompt: 'You are a financial analysis agent. Given financial data, company descriptions, or metric requests, compute relevant ratios (P/E, EV/EBITDA, ROE, current ratio, debt/equity, etc.) and produce a structured analysis. Format output as: Executive Summary, Key Metrics (table), Risk Factors, and Recommendation.',
  buildPrompt: (prompt, context) =>
    context ? `Prior research:\n${context}\n\nFinancial analysis task:\n${prompt}` : prompt,
});
