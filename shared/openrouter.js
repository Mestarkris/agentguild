// Unified LLM router: Groq primary → OpenRouter :free models fallback.
// Groq: fast, free, no credit constraints. OpenRouter catches Groq rate-limit spikes.
// Note: deepseek/deepseek-r1:free is not listed on OpenRouter; using llama-3.3-70b-instruct:free instead.

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

const OR_MODELS = [
  'qwen/qwen3-coder:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

async function callGroq({ messages, max_tokens }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const resp = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    const err = new Error(`Groq ${resp.status}: ${body}`);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  const usage = data.usage || {};
  return {
    text: data.choices?.[0]?.message?.content || '',
    servedBy: `groq/${data.model || GROQ_MODEL}`,
    tokensUsed: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
  };
}

async function callOpenRouter({ messages, max_tokens }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://agentguild.app',
      'X-Title': 'AgentGuild',
    },
    body: JSON.stringify({ models: OR_MODELS, route: 'fallback', messages, max_tokens }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const usage = data.usage || {};
  return {
    text: data.choices?.[0]?.message?.content || '',
    servedBy: `openrouter/${data.model || 'unknown'}`,
    tokensUsed: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
  };
}

async function chatComplete({ messages, system, max_tokens = 1024, callerLabel = '' }) {
  const label = callerLabel ? `[${callerLabel}]` : '[LLM]';

  const allMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  if (process.env.GROQ_API_KEY) {
    try {
      const result = await callGroq({ messages: allMessages, max_tokens });
      console.log(`${label} served by ${result.servedBy} (${result.tokensUsed} tokens)`);
      return result;
    } catch (err) {
      const reason = err.status === 429 ? 'rate-limited' : `error ${err.status || '?'}`;
      console.warn(`${label} Groq ${reason}, falling back to OpenRouter: ${err.message.slice(0, 120)}`);
    }
  }

  const result = await callOpenRouter({ messages: allMessages, max_tokens });
  console.log(`${label} served by ${result.servedBy} (${result.tokensUsed} tokens)`);
  return result;
}

module.exports = { chatComplete };
