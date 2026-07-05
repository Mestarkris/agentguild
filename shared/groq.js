'use strict';
// LLM provider via Groq with centralized rate-limiting queue and exponential backoff.
//
// Key properties:
//   • All calls go through llm-queue.js: max 3 concurrent, ≥400ms between dispatches.
//   • Key rotation counter is global within this process and never reset between calls.
//     Per-process starting offset derived from PORT env so orchestrator (3000) and
//     each agent (4001-4012) naturally start at different key positions:
//       3000 % 5 = 0, 4001 % 5 = 1, 4002 % 5 = 2, 4003 % 5 = 3, 4004 % 5 = 4, …
//   • On 429: exponential backoff (2s → 4s → 8s) retrying the NEXT key each time.
//     Max 3 attempts total (1 initial + 2 retries) → max wait 6s per call before fail.
//   • OpenRouter is a last-resort fallback only if OPENROUTER_API_KEY is set.
//
// Log lines emitted per call:
//   [LLMQueue] queued   label=X in-flight=N queued=M
//   [LLMQueue] dispatch #N label=X in-flight=N queued=M
//   [X] key=N/M served by groq/<model> (T tokens)          ← success
//   [X] key=N/M 429 — backoff 2000ms, retrying key=N+1     ← rate-limited
//   [LLMQueue] done     #N label=X in-flight=N
//   [LLMQueue] error    #N label=X in-flight=N err=…

const { enqueue } = require('./llm-queue');

const GROQ_MODEL      = 'llama-3.3-70b-versatile';
const OR_MODEL        = 'meta-llama/llama-3.3-70b-instruct:free';
const FETCH_TIMEOUT_MS = 12000;
const MAX_ATTEMPTS    = 3;       // 1 initial + 2 retries
const BACKOFF_BASE_MS = 2000;    // 2s, 4s, 8s on successive 429s

// Global key rotation: starts at a port-derived offset so concurrent agent
// processes each begin at a different key, then increments with every call.
// Never reset — stays monotonically increasing for the lifetime of this process.
// Offset by port so orchestrator (3000%5=0) and agents (4001%5=1 … 4004%5=4)
// all start at distinct positions, distributing load across keys from the first call.
const _portOffset = parseInt(process.env.PORT || '0', 10) % 5;
let _keyIdx = _portOffset;

// Emit once at module-load so it appears at startup in every process log,
// making it easy to confirm the counter is shared and starting at the right offset.
{
  const _startKeys = (() => {
    const numbered = [];
    for (let i = 1; i <= 5; i++) {
      const k = process.env[`GROQ_API_KEY_${i}`];
      if (k && k.trim()) numbered.push(k.trim());
    }
    if (numbered.length > 0) return numbered;
    const single = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim();
    return single ? [single] : [];
  })();
  if (_startKeys.length > 0) {
    console.log(`[Groq] ${_startKeys.length} key(s) — global rotation counter initialized at offset ${_portOffset} (port=${process.env.PORT ?? '?'}), never reset between calls`);
  } else {
    console.warn('[Groq] No GROQ_API_KEY_1…5 or GROQ_API_KEY found — calls will fail until keys are set');
  }
}

function _nextKeyIdx(numKeys) {
  const idx = _keyIdx % numKeys;
  _keyIdx++;
  return idx;
}

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
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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

const MOCK_RESPONSES = {
  Planner: JSON.stringify({
    subtasks: [
      { skill: 'research',   prompt: '[MOCK] Research the topic.',     complexity_weight: 1.0, position: 1 },
      { skill: 'summarizer', prompt: '[MOCK] Summarize the findings.', complexity_weight: 1.0, position: 2 },
    ],
    reasoning: '[MOCK] Mock plan — MOCK_MODE=true, no LLM called.',
  }),
  default: '[MOCK] Mock agent response — MOCK_MODE=true, no LLM called.',
};

// The actual LLM call with exponential backoff on 429.
// Runs inside the queue slot (concurrency + spacing enforced by the caller).
async function _doChat(messages, max_tokens, label) {
  const keys = getGroqKeys();

  if (keys.length === 0) {
    console.warn(`[${label}] No Groq keys configured, using OpenRouter directly`);
    return callOpenRouter(messages, max_tokens, label);
  }

  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const keyIdx = _nextKeyIdx(keys.length);

    if (attempt > 0) {
      const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1); // 2s, 4s, 8s
      console.warn(`[${label}] key=${keyIdx + 1}/${keys.length} — backoff ${backoffMs}ms then retrying`);
      console.log(`[LLMQueue] rate-limited  label=${label}  backoff=${backoffMs}ms  attempt=${attempt + 1}/${MAX_ATTEMPTS}`);
      await new Promise(r => setTimeout(r, backoffMs));
    }

    try {
      return await callGroqWithKey(keys[keyIdx], keyIdx, keys.length, messages, max_tokens, label);
    } catch (err) {
      const status = err.status;
      if (status === 429 || status === 413 || status === 524) {
        const next = (_keyIdx) % keys.length; // next key that will be picked
        console.warn(`[${label}] key=${keyIdx + 1}/${keys.length} ${status} (${status === 524 ? 'timeout' : 'rate-limited'}) — will retry key=${next + 1}`);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }

  // All attempts exhausted — try OpenRouter as last resort
  if (process.env.OPENROUTER_API_KEY) {
    console.warn(`[${label}] All ${MAX_ATTEMPTS} attempts exhausted — falling back to OpenRouter`);
    return callOpenRouter(messages, max_tokens, label);
  }

  throw lastErr || new Error(`All ${MAX_ATTEMPTS} Groq attempts failed for [${label}]`);
}

async function chatComplete({ messages, system, max_tokens = 512, callerLabel = 'Groq' }) {
  if (process.env.MOCK_MODE === 'true') {
    const text = MOCK_RESPONSES[callerLabel] ?? MOCK_RESPONSES.default;
    console.log(`[${callerLabel}] MOCK_MODE — returning canned response (0 tokens)`);
    return { text, servedBy: 'mock', tokensUsed: 0 };
  }

  const all = system ? [{ role: 'system', content: system }, ...messages] : messages;
  return enqueue(() => _doChat(all, max_tokens, callerLabel), callerLabel);
}

module.exports = { chatComplete };
