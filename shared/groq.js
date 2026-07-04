// LLM provider chain for Express agents + orchestrator:
//   1. Collect GROQ_API_KEY_1..5 (skip any that are blank)
//   2. Fall back to single GROQ_API_KEY if numbered keys are not set
//   3. On 429/413 from a key, immediately retry with the next key in the rotation
//   4. Only fall through to OpenRouter when every Groq key is exhausted
//
// Log format:
//   [Label] key=N/M served by groq/<model> (T tokens)
//   [Label] key=N/M rate-limited (429), trying key=M+1
//   [Label] all M Groq key(s) rate-limited, falling back to OpenRouter

'use strict';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OR_MODEL   = 'meta-llama/llama-3.3-70b-instruct:free';

// Module-level index so warm processes distribute load across keys instead of
// always hammering key 1.
let _rotationIdx = 0;

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
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    const err = new Error(`Groq[key=${keyIdx + 1}/${totalKeys}] ${resp.status}: ${body}`);
    err.status = resp.status;
    err.groqKeyIdx = keyIdx;
    throw err;
  }

  const data = await resp.json();
  const usage = data.usage || {};
  const tokensUsed = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  const servedBy = `groq/${data.model || GROQ_MODEL}`;

  console.log(`[${label}] key=${keyIdx + 1}/${totalKeys} served by ${servedBy} (${tokensUsed} tokens)`);
  // Advance so the next call starts after the key that just worked
  _rotationIdx = (keyIdx + 1) % totalKeys;

  return { text: data.choices && data.choices[0] && data.choices[0].message.content || '', servedBy, tokensUsed };
}

async function callOpenRouter(messages, max_tokens, label) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: OR_MODEL, messages, max_tokens }),
  });

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

async function chatComplete({ messages, system, max_tokens = 1024, callerLabel = 'Groq' }) {
  const all = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const keys = getGroqKeys();

  if (keys.length === 0) {
    console.warn(`[${callerLabel}] No Groq keys configured, using OpenRouter directly`);
    return callOpenRouter(all, max_tokens, callerLabel);
  }

  const start = _rotationIdx % keys.length;
  for (let i = 0; i < keys.length; i++) {
    const idx = (start + i) % keys.length;
    try {
      return await callGroqWithKey(keys[idx], idx, keys.length, all, max_tokens, callerLabel);
    } catch (err) {
      const status = err.status;
      if (status === 429 || status === 413) {
        const next = (idx + 1) % keys.length;
        if (i < keys.length - 1) {
          console.warn(`[${callerLabel}] key=${idx + 1}/${keys.length} rate-limited (${status}), trying key=${next + 1}`);
        }
        continue;
      }
      throw err; // Non-rate-limit error — surface immediately
    }
  }

  // Every key was rate-limited
  if (process.env.OPENROUTER_API_KEY) {
    console.warn(`[${callerLabel}] All ${keys.length} Groq key(s) rate-limited, falling back to OpenRouter`);
    return callOpenRouter(all, max_tokens, callerLabel);
  }

  throw new Error(`All ${keys.length} Groq key(s) rate-limited and OPENROUTER_API_KEY is not set`);
}

module.exports = { chatComplete };
