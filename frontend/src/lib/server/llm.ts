// Primary: Groq (llama-3.3-70b-versatile). Fallback: OpenRouter on 429 rate-limit.

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OR_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

type CompletionResult = { text: string; servedBy: string; tokensUsed: number };

async function callGroq(messages: { role: string; content: string }[], maxTokens: number, label: string): Promise<CompletionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: maxTokens }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw Object.assign(new Error(`Groq ${resp.status}: ${body}`), { status: resp.status });
  }

  const data = await resp.json() as { choices: { message: { content: string } }[]; model: string; usage?: { prompt_tokens: number; completion_tokens: number } };
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const tokensUsed = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  const servedBy = `groq/${data.model ?? GROQ_MODEL}`;
  console.log(`[${label}] served by ${servedBy} (${tokensUsed} tokens)`);
  return { text: data.choices?.[0]?.message?.content ?? '', servedBy, tokensUsed };
}

async function callOpenRouter(messages: { role: string; content: string }[], maxTokens: number, label: string): Promise<CompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OR_MODEL, messages, max_tokens: maxTokens }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${body}`);
  }

  const data = await resp.json() as { choices: { message: { content: string } }[]; model: string; usage?: { prompt_tokens: number; completion_tokens: number } };
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const tokensUsed = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  const servedBy = `openrouter/${data.model ?? OR_MODEL}`;
  console.log(`[${label}] served by ${servedBy} (${tokensUsed} tokens) [fallback]`);
  return { text: data.choices?.[0]?.message?.content ?? '', servedBy, tokensUsed };
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
  const all = system ? [{ role: 'system', content: system }, ...messages] : messages;

  try {
    return await callGroq(all, maxTokens, label);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if ((status === 429 || status === 413) && process.env.OPENROUTER_API_KEY) {
      console.warn(`[${label}] Groq rate-limited (${status}), falling back to OpenRouter`);
      return await callOpenRouter(all, maxTokens, label);
    }
    throw err;
  }
}
