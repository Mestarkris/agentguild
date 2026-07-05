// LLM provider via Groq with centralized rate-limiting queue and exponential backoff.
//
// Key properties:
//   • All calls go through llm-queue.ts: max 3 concurrent, ≥400ms between dispatches.
//   • Key rotation counter is global within this invocation and never reset between calls.
//   • On 429: exponential backoff (2s → 4s → 8s) retrying the NEXT key each time.
//     Max 3 attempts total (1 initial + 2 retries) → max wait 6s per call before fail.
//   • OpenRouter is last-resort fallback only if OPENROUTER_API_KEY is set.
//
// Set MOCK_MODE=true to skip all LLM calls and return canned responses instantly.

import { enqueue } from './llm-queue';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OR_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const FETCH_TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 3;      // 1 initial + 2 retries
const BACKOFF_BASE_MS = 2000; // 2s, 4s on successive 429s

// Canned responses for MOCK_MODE=true — realistic enough to pass quality scoring
const MOCK_RESPONSES: Record<string, string> = {
  Planner: `{"subtasks":[{"skill":"research","prompt":"Research the topic thoroughly","complexity_weight":1.5,"position":1},{"skill":"summarizer","prompt":"Summarize the research findings","complexity_weight":1.0,"position":2}],"reasoning":"Mock plan: research then summarize."}`,
  research: `## Overview\nThis is a mock research report for UI testing purposes.\n\n## Key Findings\n- Finding 1: Mock data point alpha with supporting evidence\n- Finding 2: Mock data point beta [Source: Mock Source]\n- Finding 3: Quantitative result: 42% improvement noted\n\n## Data Points\n| Metric | Value |\n|--------|-------|\n| Sample | 1,000 |\n| Result | 87% |\n\n## Conclusion\nMock conclusion: the evidence supports the hypothesis with high confidence.`,
  summarizer: `**Mock Summary:** This is a concise mock summary generated in MOCK_MODE. Key points: (1) the input was processed, (2) relevant information was extracted, (3) conclusions were synthesized into this brief output for UI testing.`,
  translate: `[MOCK TRANSLATION] Este es un texto de traducción simulado generado en modo de prueba para verificar el flujo de la interfaz de usuario sin consumir créditos de API reales.`,
  sentiment: `{"overall":"positive","score":0.72,"emotions":["optimistic","engaged","curious"],"confidence":0.88,"reasoning":"Mock sentiment analysis — positive tone detected in the input text during UI test mode."}`,
  sql: `\`\`\`sql\nSELECT id, name, created_at\nFROM mock_table\nWHERE status = 'active'\nORDER BY created_at DESC\nLIMIT 10;\n\`\`\`\n\n**Explanation:** Mock SQL query selecting active records ordered by creation date.\n\n**Assumptions:** Table named mock_table with standard columns.`,
  chart: `{"type":"bar","data":{"labels":["Jan","Feb","Mar","Apr","May"],"datasets":[{"label":"Mock Data","data":[42,67,53,89,74],"backgroundColor":"rgba(99,102,241,0.7)"}]},"options":{"responsive":true,"plugins":{"title":{"display":true,"text":"Mock Chart (UI Test Mode)"}}}}`,
  extract: `{"entities":[{"type":"organization","value":"AgentGuild","confidence":0.95},{"type":"date","value":"2026-07-04","confidence":0.99}],"numbers":[{"value":42,"context":"mock quantity"}],"key_values":{"mode":"mock","purpose":"ui-testing"},"summary":"Mock extraction result for UI flow testing."}`,
  'legal-review': `**Risk Analysis (Mock Mode)**\n\n**HIGH:** Mock unlimited liability clause — "Party shall be liable for all damages whatsoever." Risk: unbounded financial exposure.\n\n**MEDIUM:** Mock auto-renewal — agreement renews automatically unless cancelled 30 days prior.\n\n**LOW:** Mock non-compete — 6-month restriction in same industry after termination.\n\n*Note: Mock output generated for UI testing only.*`,
  finance: `## Executive Summary\nMock financial analysis generated for UI testing purposes.\n\n## Key Metrics\n| Metric | Value |\n|--------|-------|\n| Mock Revenue | $1.2M |\n| Mock Growth | 23% YoY |\n| Mock Margin | 34% |\n\n## Risk Factors\n- Mock risk 1: market concentration\n- Mock risk 2: regulatory exposure\n\n## Recommendation\nHold. Mock analysis indicates stable performance with moderate growth potential.`,
  transcribe: `**Speaker A:** This is a mock transcript generated for UI testing purposes without consuming real API credits.\n\n**Speaker B:** Understood. The mock mode is working correctly and the pipeline is flowing as expected.\n\n**Speaker A:** Great. We can verify the PDF rendering and job graph display without burning tokens.`,
  'fact-check': `[{"claim":"Mock claim for UI testing","verdict":"unverifiable","confidence":0.5,"explanation":"This is a mock fact-check result generated in MOCK_MODE — no real verification performed.","caveats":"All results are fabricated for UI flow testing only."},{"claim":"AgentGuild is a hackathon project","verdict":"true","confidence":0.99,"explanation":"Confirmed: AgentGuild is built for the Canteen × Circle hackathon.","caveats":"None."}]`,
  'code-review': `**Code Review (Mock Mode)**\n\n1. **[MINOR]** Mock finding: variable naming could be more descriptive. Suggested fix: rename \`x\` to \`itemCount\`.\n\n2. **[MAJOR]** Mock finding: missing error handling in async function. Suggested fix: wrap in try/catch and propagate errors.\n\n3. **[MINOR]** Mock finding: unused import detected. Suggested fix: remove the unused import to reduce bundle size.\n\n*Generated in MOCK_MODE — no real code was analyzed.*`,
};

// Parse Groq's relative-time reset headers ("229ms", "30s", "1m26.4s") → ms.
function parseResetMs(str: string | undefined): number | null {
  if (!str) return null;
  let total = 0;
  const minsMatch = str.match(/(\d+(?:\.\d+)?)m(?!s)/);
  const secsMatch = str.match(/(\d+(?:\.\d+)?)s\b/);
  const msMatch   = str.match(/(\d+(?:\.\d+)?)ms\b/);
  if (minsMatch) total += parseFloat(minsMatch[1]) * 60_000;
  if (secsMatch) total += parseFloat(secsMatch[1]) * 1_000;
  if (msMatch)   total += parseFloat(msMatch[1]);
  return total > 0 ? Math.ceil(total) : null;
}

type CompletionResult = { text: string; servedBy: string; tokensUsed: number };

// Global rotation index — never reset, increments with every chatComplete call.
// Random init so concurrent serverless invocations don't all start at key_1.
let _keyIdx = Math.floor(Math.random() * 5);

function _nextKeyIdx(numKeys: number): number {
  const idx = _keyIdx % numKeys;
  _keyIdx++;
  return idx;
}

function getGroqKeys(): string[] {
  const numbered: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k?.trim()) numbered.push(k.trim());
  }
  if (numbered.length > 0) return numbered;
  // Fallback: single key env var (backwards compat)
  const single = process.env.GROQ_API_KEY?.trim();
  return single ? [single] : [];
}

async function callGroqWithKey(
  apiKey: string,
  keyIdx: number,
  totalKeys: number,
  messages: { role: string; content: string }[],
  maxTokens: number,
  label: string,
): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: maxTokens }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = (err as { name?: string }).name === 'AbortError';
    throw Object.assign(new Error(`Groq[key=${keyIdx + 1}/${totalKeys}] ${isTimeout ? 'timeout' : (err as Error).message}`), {
      status: isTimeout ? 524 : 0,
      groqKeyIdx: keyIdx,
      retryAfterMs: null,
    });
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const retryAfterMs = parseResetMs(
      resp.headers.get('x-ratelimit-reset-tokens') ?? resp.headers.get('x-ratelimit-reset-requests') ?? undefined
    );
    const body = await resp.text();
    throw Object.assign(new Error(`Groq[key=${keyIdx + 1}/${totalKeys}] ${resp.status}: ${body}`), {
      status: resp.status,
      groqKeyIdx: keyIdx,
      retryAfterMs,
    });
  }

  const data = await resp.json() as {
    choices: { message: { content: string } }[];
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const tokensUsed = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  const servedBy = `groq/${data.model ?? GROQ_MODEL}`;
  console.log(`[${label}] key=${keyIdx + 1}/${totalKeys} served by ${servedBy} (${tokensUsed} tokens)`);
  return { text: data.choices?.[0]?.message?.content ?? '', servedBy, tokensUsed };
}

async function callOpenRouter(
  messages: { role: string; content: string }[],
  maxTokens: number,
  label: string,
): Promise<CompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OR_MODEL, messages, max_tokens: maxTokens }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`OpenRouter ${(err as { name?: string }).name === 'AbortError' ? 'timeout' : (err as Error).message}`);
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${body}`);
  }

  const data = await resp.json() as {
    choices: { message: { content: string } }[];
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const tokensUsed = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  const servedBy = `openrouter/${data.model ?? OR_MODEL}`;
  console.log(`[${label}] served by ${servedBy} (${tokensUsed} tokens) [openrouter-fallback]`);
  return { text: data.choices?.[0]?.message?.content ?? '', servedBy, tokensUsed };
}

// Inner function: actual LLM call with exponential backoff. Runs inside queue slot.
async function _doChat(
  messages: { role: string; content: string }[],
  maxTokens: number,
  label: string,
): Promise<CompletionResult> {
  const keys = getGroqKeys();

  if (keys.length === 0) {
    console.warn(`[${label}] No Groq keys configured, using OpenRouter directly`);
    return callOpenRouter(messages, maxTokens, label);
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const keyIdx = _nextKeyIdx(keys.length);

    if (attempt > 0) {
      const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1); // 2s, 4s
      console.warn(`[${label}] key=${keyIdx + 1}/${keys.length} — backoff ${backoffMs}ms then retrying`);
      console.log(`[LLMQueue] rate-limited  label=${label}  backoff=${backoffMs}ms  attempt=${attempt + 1}/${MAX_ATTEMPTS}`);
      await new Promise<void>(r => setTimeout(r, backoffMs));
    }

    try {
      return await callGroqWithKey(keys[keyIdx], keyIdx, keys.length, messages, maxTokens, label);
    } catch (err) {
      const e = err as { status?: number };
      if (e.status === 429 || e.status === 413 || e.status === 524) {
        const next = _keyIdx % keys.length;
        console.warn(`[${label}] key=${keyIdx + 1}/${keys.length} ${e.status} (${e.status === 524 ? 'timeout' : 'rate-limited'}) — will retry key=${next + 1}`);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }

  if (process.env.OPENROUTER_API_KEY) {
    console.warn(`[${label}] All ${MAX_ATTEMPTS} attempts exhausted — falling back to OpenRouter`);
    return callOpenRouter(messages, maxTokens, label);
  }

  throw lastErr ?? new Error(`All ${MAX_ATTEMPTS} Groq attempts failed for [${label}]`);
}

export async function chatComplete({
  messages,
  system,
  maxTokens = 1024,
  label = 'LLM',
}: {
  messages: { role: string; content: string }[];
  system?: string;
  maxTokens?: number;
  label?: string;
}): Promise<CompletionResult> {
  if (process.env.MOCK_MODE === 'true') {
    const text = MOCK_RESPONSES[label] ?? `[MOCK] Canned response for ${label} — no real LLM call made.`;
    console.log(`[${label}] MOCK_MODE — skipping LLM call`);
    return { text, servedBy: 'mock', tokensUsed: 0 };
  }

  const all = system ? [{ role: 'system', content: system }, ...messages] : messages;
  return enqueue(() => _doChat(all, maxTokens, label), label);
}
