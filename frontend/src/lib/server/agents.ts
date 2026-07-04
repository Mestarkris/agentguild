import { chatComplete } from './llm';

interface AgentDef {
  skill: string;
  system: string;
  buildPrompt: (prompt: string, context: string) => string;
}

const AGENT_DEFS: AgentDef[] = [
  {
    skill: 'summarizer',
    system: 'You are a precise summarization agent. Summarize text concisely, preserving key facts, numbers, and conclusions. Respond with the summary only — no preamble.',
    buildPrompt: (p, ctx) => ctx ? `Previous context:\n${ctx}\n\nSummarize:\n${p}` : `Summarize:\n${p}`,
  },
  {
    skill: 'code-review',
    system: 'You are a senior code reviewer. Identify bugs, security issues, and style improvements. Format as numbered findings with severity (critical/major/minor), description, and suggested fix.',
    buildPrompt: (p, ctx) => ctx ? `${p}\n\nCode to review:\n${ctx}` : p,
  },
  {
    skill: 'research',
    system: 'You are a thorough research agent. Provide a detailed report with: Overview, Key Findings, Data Points, Conclusion. Use [Source: <description>] for citations.',
    buildPrompt: (p, ctx) => ctx ? `${p}\n\nBackground:\n${ctx}` : p,
  },
  {
    skill: 'translate',
    system: 'You are a professional multilingual translation agent. Detect source language and translate accurately, preserving tone and formatting. If target language is specified in brackets like [to: Spanish], use it. Respond with only the translated text.',
    buildPrompt: (p, ctx) => ctx ? `${p}\n\nText:\n${ctx}` : p,
  },
  {
    skill: 'sentiment',
    system: 'You are a sentiment analysis agent. Output JSON: { "overall": "positive|negative|neutral", "score": <-1.0 to 1.0>, "emotions": [...], "confidence": <0-1>, "reasoning": "..." }. Respond with valid JSON only.',
    buildPrompt: (p, ctx) => ctx ? `Analyze sentiment of:\n${ctx}` : `Analyze sentiment of:\n${p}`,
  },
  {
    skill: 'sql',
    system: 'You are a SQL generation agent. Convert natural language to valid PostgreSQL. Respond with: 1) The SQL query in a code block, 2) Brief explanation, 3) Assumptions made.',
    buildPrompt: (p, ctx) => ctx ? `Schema context:\n${ctx}\n\nGenerate SQL for:\n${p}` : `Generate SQL for:\n${p}`,
  },
  {
    skill: 'chart',
    system: 'You are a data visualization agent. Convert data descriptions into Chart.js config JSON. Output only valid JSON that can be passed directly to Chart.js. Choose the most appropriate chart type.',
    buildPrompt: (p, ctx) => ctx ? `Data context:\n${ctx}\n\nCreate chart for:\n${p}` : `Create chart for:\n${p}`,
  },
  {
    skill: 'extract',
    system: 'You are a structured data extraction agent. Extract entities, dates, numbers, and key-value pairs from text. Output valid JSON with all extracted data.',
    buildPrompt: (p, ctx) => ctx ? `${p}\n\nSource text:\n${ctx}` : p,
  },
  {
    skill: 'legal-review',
    system: 'You are a legal document review agent (informational only, not legal advice). Identify risky clauses: unlimited liability, one-sided termination, IP assignment, non-compete, auto-renewal. For each risk: clause text (quoted), risk type, severity (high/medium/low), plain-English explanation.',
    buildPrompt: (p, ctx) => ctx ? `Review for risky clauses:\n\n${ctx}` : `Review for risky clauses:\n\n${p}`,
  },
  {
    skill: 'finance',
    system: 'You are a financial analysis agent. Compute relevant ratios and produce: Executive Summary, Key Metrics (table), Risk Factors, Recommendation.',
    buildPrompt: (p, ctx) => ctx ? `Prior research:\n${ctx}\n\nAnalysis task:\n${p}` : p,
  },
  {
    skill: 'transcribe',
    system: 'You are a transcription agent. Clean up and format transcripts with speaker labels (Speaker A:, Speaker B:) where applicable. Remove filler words.',
    buildPrompt: (p, ctx) => ctx ? `Process:\n${p}\n\nContent:\n${ctx}` : `Process:\n${p}`,
  },
  {
    skill: 'fact-check',
    system: 'You are a fact-checking agent. For each claim, evaluate based on your knowledge. Output a JSON array: [{ "claim": "...", "verdict": "true|false|partially-true|unverifiable", "confidence": <0-1>, "explanation": "...", "caveats": "..." }]',
    buildPrompt: (p, ctx) => ctx ? `Fact-check:\n${p}\n\nSource material:\n${ctx}` : `Fact-check:\n${p}`,
  },
];

const AGENT_BY_SKILL = Object.fromEntries(AGENT_DEFS.map(a => [a.skill, a]));

// Error phrases that signal the model couldn't fulfill the request
const REFUSAL_PATTERNS = [
  /i('m| am) (sorry|unable|not able)/i,
  /i (cannot|can't|couldn't|don't have (access|the ability))/i,
  /as an? (ai|language model|llm)/i,
  /i do not have (access|the ability|real.time)/i,
  /no (audio|image|file|attachment) (was |is )?provided/i,
];

function computeQualityScore(result: string, tokensUsed: number, elapsedMs: number): number {
  if (!result || result.length < 20) return 0.3;

  // Start from a length-based score (log-scaled: 100 chars → 0.6, 500 chars → 0.85, 1500+ → 0.95)
  const lengthScore = Math.min(0.95, 0.4 + Math.log10(Math.max(1, result.length / 100)) * 0.35);

  // Structured output bonus: JSON, markdown headers, bullet points
  const hasStructure = /```|^#{1,3} |\*\*|\|.*\||\[.*\][\s\S]*{/m.test(result);
  const structureBonus = hasStructure ? 0.05 : 0;

  // Token efficiency: very low token count for a long result is a warning sign
  const tokenPenalty = tokensUsed < 30 ? -0.15 : 0;

  // Latency penalty: > 15s suggests problems
  const latencyPenalty = elapsedMs > 15000 ? -0.1 : 0;

  // Refusal penalty: model said it couldn't do the task
  const refusalPenalty = REFUSAL_PATTERNS.some(p => p.test(result)) ? -0.25 : 0;

  return Math.min(1.0, Math.max(0.1, lengthScore + structureBonus + tokenPenalty + latencyPenalty + refusalPenalty));
}

export async function runAgentInline(
  skill: string,
  prompt: string,
  context: string
): Promise<{ result: string; tokensUsed: number; qualityScore: number; servedBy: string }> {
  const def = AGENT_BY_SKILL[skill];
  if (!def) throw new Error(`Unknown skill: ${skill}`);

  const userMessage = def.buildPrompt(prompt, context);
  const start = Date.now();

  const { text: result, servedBy, tokensUsed } = await chatComplete({
    system: def.system,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 1024,
    label: skill,
  });

  const elapsed = Date.now() - start;
  const qualityScore = computeQualityScore(result, tokensUsed, elapsed);
  return { result, tokensUsed, qualityScore, servedBy };
}
