import { chatComplete } from './llm';

interface AgentDef {
  skill: string;
  maxTokens: number;
  system: string;
  buildPrompt: (prompt: string, context: string) => string;
}

const AGENT_DEFS: AgentDef[] = [
  {
    skill: 'summarizer',
    maxTokens: 384,
    system: 'Summarize the input concisely, preserving key facts, numbers, and conclusions. Output the summary only.',
    buildPrompt: (p, ctx) => ctx ? `Previous context:\n${ctx}\n\nSummarize:\n${p}` : `Summarize:\n${p}`,
  },
  {
    skill: 'code-review',
    maxTokens: 768,
    system: 'Review code for bugs, security issues, and style problems. Output numbered findings: severity (critical/major/minor), description, suggested fix.',
    buildPrompt: (p, ctx) => ctx ? `${p}\n\nCode:\n${ctx}` : p,
  },
  {
    skill: 'research',
    maxTokens: 1024,
    system: 'Research the topic and produce a report: Overview, Key Findings, Data Points, Conclusion. Cite sources as [Source: description].',
    buildPrompt: (p, ctx) => ctx ? `${p}\n\nBackground:\n${ctx}` : p,
  },
  {
    skill: 'translate',
    maxTokens: 512,
    system: 'Translate the input accurately, preserving tone and formatting. If target language is given as [to: Language], use it. Output translated text only.',
    buildPrompt: (p, ctx) => ctx ? `${p}\n\nText:\n${ctx}` : p,
  },
  {
    skill: 'sentiment',
    maxTokens: 256,
    system: 'Analyze sentiment. Output valid JSON only: {"overall":"positive|negative|neutral","score":<-1 to 1>,"emotions":[...],"confidence":<0-1>,"reasoning":"..."}',
    buildPrompt: (p, ctx) => ctx ? `Analyze sentiment of:\n${ctx}` : `Analyze sentiment of:\n${p}`,
  },
  {
    skill: 'sql',
    maxTokens: 384,
    system: 'Convert natural language to valid PostgreSQL. Output: 1) SQL in a code block, 2) brief explanation, 3) assumptions.',
    buildPrompt: (p, ctx) => ctx ? `Schema:\n${ctx}\n\nGenerate SQL for:\n${p}` : `Generate SQL for:\n${p}`,
  },
  {
    skill: 'chart',
    maxTokens: 512,
    system: 'Convert data to Chart.js config JSON. Output valid JSON only. Choose the most appropriate chart type.',
    buildPrompt: (p, ctx) => ctx ? `Data:\n${ctx}\n\nCreate chart for:\n${p}` : `Create chart for:\n${p}`,
  },
  {
    skill: 'extract',
    maxTokens: 512,
    system: 'Extract entities, dates, numbers, and key-value pairs from text. Output valid JSON with all extracted data.',
    buildPrompt: (p, ctx) => ctx ? `${p}\n\nSource text:\n${ctx}` : p,
  },
  {
    skill: 'legal-review',
    maxTokens: 768,
    system: 'Identify risky clauses: unlimited liability, one-sided termination, IP assignment, non-compete, auto-renewal. For each: quote the clause, name the risk type, rate severity (high/medium/low), explain in plain English.',
    buildPrompt: (p, ctx) => ctx ? `Review for risky clauses:\n\n${ctx}` : `Review for risky clauses:\n\n${p}`,
  },
  {
    skill: 'finance',
    maxTokens: 768,
    system: 'Analyze the financials. Produce: Executive Summary, Key Metrics (table), Risk Factors, Recommendation.',
    buildPrompt: (p, ctx) => ctx ? `Prior research:\n${ctx}\n\nTask:\n${p}` : p,
  },
  {
    skill: 'transcribe',
    maxTokens: 512,
    system: 'Clean up and format the transcript. Add speaker labels (Speaker A:, Speaker B:) where applicable. Remove filler words.',
    buildPrompt: (p, ctx) => ctx ? `Process:\n${p}\n\nContent:\n${ctx}` : `Process:\n${p}`,
  },
  {
    skill: 'fact-check',
    maxTokens: 512,
    system: 'Fact-check each claim. Output a JSON array: [{"claim":"...","verdict":"true|false|partially-true|unverifiable","confidence":<0-1>,"explanation":"...","caveats":"..."}]',
    buildPrompt: (p, ctx) => ctx ? `Fact-check:\n${p}\n\nSource:\n${ctx}` : `Fact-check:\n${p}`,
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
    maxTokens: def.maxTokens,
    label: skill,
  });

  const elapsed = Date.now() - start;
  const qualityScore = computeQualityScore(result, tokensUsed, elapsed);
  return { result, tokensUsed, qualityScore, servedBy };
}
