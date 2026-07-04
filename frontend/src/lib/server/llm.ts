// LLM provider chain:
//   1. Rotate through GROQ_API_KEY_1..5 (skip 429/413 per key, immediate retry on next)
//   2. Fall back to single GROQ_API_KEY if numbered keys not set
//   3. Fall through to OpenRouter only when every Groq key is exhausted
//
// Log format: [label] key=N/M served by groq/model (tokens tokens)
//             [label] all Groq keys exhausted, trying OpenRouter

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OR_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

type CompletionResult = { text: string; servedBy: string; tokensUsed: number };

// Module-level rotation index so hot lambdas distribute load across keys
// rather than always starting at key 1.
let _rotationIdx = 0;

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
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: maxTokens }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw Object.assign(new Error(`Groq[key=${keyIdx + 1}/${totalKeys}] ${resp.status}: ${body}`), {
      status: resp.status,
      groqKeyIdx: keyIdx,
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
  // Advance rotation so the next call starts from the key AFTER the one that just worked
  _rotationIdx = (keyIdx + 1) % totalKeys;
  return { text: data.choices?.[0]?.message?.content ?? '', servedBy, tokensUsed };
}

async function callOpenRouter(
  messages: { role: string; content: string }[],
  maxTokens: number,
  label: string,
): Promise<CompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OR_MODEL, messages, max_tokens: maxTokens }),
  });

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
  const keys = getGroqKeys();

  if (keys.length === 0) {
    // No Groq keys at all — go straight to OpenRouter
    console.warn(`[${label}] No Groq keys configured, using OpenRouter directly`);
    return callOpenRouter(all, maxTokens, label);
  }

  // Try each Groq key starting from the current rotation index.
  // On 429/413 move to the next key immediately; any other error re-throws.
  const start = _rotationIdx % keys.length;
  for (let i = 0; i < keys.length; i++) {
    const idx = (start + i) % keys.length;
    try {
      return await callGroqWithKey(keys[idx], idx, keys.length, all, maxTokens, label);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 413) {
        const next = (idx + 1) % keys.length;
        if (i < keys.length - 1) {
          console.warn(`[${label}] key=${idx + 1}/${keys.length} rate-limited (${status}), trying key=${next + 1}`);
        }
        continue;
      }
      throw err; // Non-rate-limit error — surface it
    }
  }

  // All Groq keys exhausted — fall through to OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    console.warn(`[${label}] All ${keys.length} Groq key(s) rate-limited, falling back to OpenRouter`);
    return callOpenRouter(all, maxTokens, label);
  }

  throw new Error(`All ${keys.length} Groq key(s) rate-limited and no OpenRouter key configured`);
}
