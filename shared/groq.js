// Single LLM provider: Groq with llama-3.3-70b-versatile.
// Throws on failure — no silent fallbacks, no demo results.

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

async function chatComplete({ messages, system, max_tokens = 1024, callerLabel = '' }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const label = callerLabel ? `[${callerLabel}]` : '[Groq]';
  const allMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  const resp = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: GROQ_MODEL, messages: allMessages, max_tokens }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Groq ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const usage = data.usage ?? {};
  const tokensUsed = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  const servedBy = `groq/${data.model ?? GROQ_MODEL}`;

  console.log(`${label} served by ${servedBy} (${tokensUsed} tokens)`);
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    servedBy,
    tokensUsed,
  };
}

module.exports = { chatComplete };
