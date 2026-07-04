// LLM provider chain for Express agents + orchestrator:
//   1. Collect GROQ_API_KEY_1..5 (skip any that are blank)
//   2. Fall back to single GROQ_API_KEY if numbered keys are not set
//   3. On 429/413 from a key, immediately retry with the next key in the rotation
//   4. If ALL keys are exhausted, wait for the shortest reset window reported by
//      Groq's x-ratelimit-reset-tokens header, then retry the full rotation once
//   5. Only fall through to OpenRouter when both passes are exhausted
//
// Log format:
//   [Label] key=N/M served by groq/<model> (T tokens)
//   [Label] key=N/M rate-limited (429), trying key=M+1
//   [Label] all M Groq key(s) rate-limited — waiting Xs for windows to refill, retrying…
//   [Label] all M Groq key(s) still rate-limited after retry, falling back to OpenRouter

'use strict';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OR_MODEL   = 'meta-llama/llama-3.3-70b-instruct:free';

// Per-process starting index: combine PID with a random offset so that agent
// processes spawned in the same second (sequential PIDs differing by 1-12) still
// spread across keys rather than all mapping to the same pid%5 bucket.
// Concurrent calls within the same process each claim a slot atomically in
// chatComplete() before any await, so they never share the same starting key.
let _rotationIdx = ((process.pid || 0) + Math.floor(Math.random() * 97)) % 5;

// Parse Groq's relative-time reset headers ("229ms", "30s", "1m26.4s") → ms.
function parseResetMs(str) {
  if (!str) return null;
  let total = 0;
  const minsMatch = str.match(/(\d+(?:\.\d+)?)m(?!s)/);
  const secsMatch = str.match(/(\d+(?:\.\d+)?)s\b/);
  const msMatch   = str.match(/(\d+(?:\.\d+)?)ms\b/);
  if (minsMatch) total += parseFloat(minsMatch[1]) * 60000;
  if (secsMatch) total += parseFloat(secsMatch[1]) * 1000;
  if (msMatch)   total += parseFloat(msMatch[1]);
  return total > 0 ? Math.ceil(total) : null;
}

function getGroqKeys() {
  const numbered = [];
  for (let i = 1; i <= 5; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k && k.trim()) numbered.push(k.trim());
  }
  if (numbered.length > 0) return numbered;
  // Backwards-compat: single key
  const single = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim();
  return single ? [single] : [];
}

async function callGroqWithKey(apiKey, keyIdx, totalKeys, messages, max_tokens, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens }),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(timeout);
    const err = new Error(`Groq[key=${keyIdx + 1}/${totalKeys}] fetch failed: ${fetchErr.message}`);
    err.status = fetchErr.name === 'AbortError' ? 524 : 503;
    err.groqKeyIdx = keyIdx;
    throw err;
  }
  clearTimeout(timeout);

  if (!resp.ok) {
    // Capture the reset window so callers can sleep-and-retry intelligently.
    const retryAfterMs = parseResetMs(
      resp.headers.get('x-ratelimit-reset-tokens') ||
      resp.headers.get('x-ratelimit-reset-requests')
    );
    const body = await resp.text();
    const err = new Error(`Groq[key=${keyIdx + 1}/${totalKeys}] ${resp.status}: ${body}`);
    err.status = resp.status;
    err.groqKeyIdx = keyIdx;
    err.retryAfterMs = retryAfterMs;
    throw err;
  }

  const data = await resp.json();
  const usage = data.usage || {};
  const tokensUsed = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  const servedBy = `groq/${data.model || GROQ_MODEL}`;

  console.log(`[${label}] key=${keyIdx + 1}/${totalKeys} served by ${servedBy} (${tokensUsed} tokens)`);

  return { text: data.choices && data.choices[0] && data.choices[0].message.content || '', servedBy, tokensUsed };
}

async function callOpenRouter(messages, max_tokens, label) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: OR_MODEL, messages, max_tokens }),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(timeout);
    throw new Error(`OpenRouter fetch failed: ${fetchErr.message}`);
  }
  clearTimeout(timeout);

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const usage = data.usage || {};
  const tokensUsed = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  const servedBy = `openrouter/${data.model || OR_MODEL}`;

  console.log(`[${label}] served by ${servedBy} (${tokensUsed} tokens) [openrouter-fallback]`);
  return { text: data.choices && data.choices[0] && data.choices[0].message.content || '', servedBy, tokensUsed };
}

// Maximum time to wait for Groq rate-limit windows to refill before giving up.
const MAX_RETRY_WAIT_MS = 10000; // was 35000 — fail faster
// Hard timeout per individual LLM fetch attempt.
const FETCH_TIMEOUT_MS = 12000;

// Mock mode: set MOCK_MODE=true in env to skip all LLM calls and return canned responses.
// Use this for UI/wallet/PDF testing so you don't burn tokens.
const MOCK_RESPONSES = {
  Planner: JSON.stringify({
    subtasks: [
      { skill: 'research',   prompt: '[MOCK] Research the topic.',   complexity_weight: 1.0, position: 1 },
      { skill: 'summarizer', prompt: '[MOCK] Summarize the findings.', complexity_weight: 1.0, position: 2 },
    ],
    reasoning: '[MOCK] Mock plan — MOCK_MODE=true, no LLM called.',
  }),
  default: '[MOCK] Mock agent response — MOCK_MODE=true, no LLM called.',
};

async function chatComplete({ messages, system, max_tokens = 512, callerLabel = 'Groq' }) {
  if (process.env.MOCK_MODE === 'true') {
    const text = MOCK_RESPONSES[callerLabel] ?? MOCK_RESPONSES.default;
    console.log(`[${callerLabel}] MOCK_MODE — returning canned response (0 tokens)`);
    return { text, servedBy: 'mock', tokensUsed: 0 };
  }

  const all = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const keys = getGroqKeys();

  if (keys.length === 0) {
    console.warn(`[${callerLabel}] No Groq keys configured, using OpenRouter directly`);
    return callOpenRouter(all, max_tokens, callerLabel);
  }

  // Two attempts: first pass tries all keys; if all 429, sleep for the shortest
  // reported reset window then make a second pass before touching OpenRouter.
  for (let attempt = 0; attempt <= 1; attempt++) {
    // Claim a starting slot atomically (before any await) so two concurrent calls
    // within this process each begin at a different key, never piling onto key_1.
    const start = _rotationIdx % keys.length;
    _rotationIdx = (start + 1) % keys.length;

    let minRetryAfterMs = null; // shortest reset window seen across all 429s this pass

    for (let i = 0; i < keys.length; i++) {
      const idx = (start + i) % keys.length;
      try {
        return await callGroqWithKey(keys[idx], idx, keys.length, all, max_tokens, callerLabel);
      } catch (err) {
        const status = err.status;
        // Retry across keys on: 429/413 (rate limit) and 524 (Cloudflare gateway timeout).
        if (status === 429 || status === 413 || status === 524) {
          if (err.retryAfterMs != null) {
            minRetryAfterMs = minRetryAfterMs == null
              ? err.retryAfterMs
              : Math.min(minRetryAfterMs, err.retryAfterMs);
          }
          const next = (idx + 1) % keys.length;
          if (i < keys.length - 1) {
            console.warn(`[${callerLabel}] key=${idx + 1}/${keys.length} ${status} (${status === 524 ? 'timeout' : 'rate-limited'}), trying key=${next + 1}`);
          }
          continue;
        }
        throw err; // Other errors — surface immediately
      }
    }

    // Every key was rate-limited this pass.
    if (attempt === 0) {
      const waitMs = Math.min(minRetryAfterMs ?? 10000, MAX_RETRY_WAIT_MS);
      console.warn(
        `[${callerLabel}] All ${keys.length} Groq key(s) unavailable — ` +
        `waiting ${(waitMs / 1000).toFixed(1)}s, retrying…`
      );
      await new Promise(r => setTimeout(r, waitMs));
      // Second pass starts at the top of the for-loop.
    }
  }

  // Both passes exhausted — last resort is OpenRouter.
  if (process.env.OPENROUTER_API_KEY) {
    console.warn(`[${callerLabel}] All ${keys.length} Groq key(s) still rate-limited after retry, falling back to OpenRouter`);
    return callOpenRouter(all, max_tokens, callerLabel);
  }

  throw new Error(`All ${keys.length} Groq key(s) rate-limited after retry and OPENROUTER_API_KEY is not set`);
}

module.exports = { chatComplete };
