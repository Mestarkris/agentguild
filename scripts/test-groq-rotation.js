#!/usr/bin/env node
// Stress-test for shared/groq.js multi-key rotation.
//
// Usage:
//   node scripts/test-groq-rotation.js [concurrency] [total]
//
// Defaults: 8 concurrent, 20 total requests.
// Each request is a tiny LLM call. Watch for "key=N/M" rotation in the logs.
// If a real 429 occurs you'll also see "rate-limited, trying key=N+1".

'use strict';

require(require('path').join(__dirname, '../orchestrator/node_modules/dotenv')).config({
  path: require('path').join(__dirname, '../orchestrator/.env'),
});
const { chatComplete } = require('../shared/groq');

const CONCURRENCY = parseInt(process.argv[2] || '8', 10);
const TOTAL       = parseInt(process.argv[3] || '20', 10);

const PROMPTS = [
  'Reply with only the word "banana".',
  'What is 2+2? Reply with the number only.',
  'Name one color. Reply with one word.',
  'Complete: The sky is ___. One word.',
  'Reply with only the word "apple".',
];

async function one(n) {
  const prompt = PROMPTS[n % PROMPTS.length];
  const t0 = Date.now();
  try {
    const { text, servedBy, tokensUsed } = await chatComplete({
      callerLabel: `test-${n + 1}`,
      max_tokens: 16,
      messages: [{ role: 'user', content: prompt }],
    });
    const ms = Date.now() - t0;
    console.log(`  #${String(n + 1).padStart(2)} ✓  ${servedBy}  ${tokensUsed}t  ${ms}ms  → "${text.trim().slice(0, 40)}"`);
  } catch (err) {
    const ms = Date.now() - t0;
    console.error(`  #${String(n + 1).padStart(2)} ✗  ${err.message}  ${ms}ms`);
  }
}

async function run() {
  const keys = [];
  let found = 0;
  for (let i = 1; i <= 5; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k && k.trim()) { keys.push(`key_${i}`); found++; }
  }
  if (found === 0 && process.env.GROQ_API_KEY) { keys.push('legacy key'); found = 1; }

  console.log(`\nGroq rotation stress-test`);
  console.log(`  Keys detected : ${found} (${keys.join(', ')})`);
  console.log(`  Concurrency   : ${CONCURRENCY}`);
  console.log(`  Total requests: ${TOTAL}`);
  console.log(`  OpenRouter    : ${process.env.OPENROUTER_API_KEY ? 'configured (last resort)' : 'NOT configured'}`);
  console.log('─'.repeat(64));

  const t0 = Date.now();
  let i = 0;

  // Sliding window of CONCURRENCY in-flight promises
  const inFlight = new Set();

  while (i < TOTAL || inFlight.size > 0) {
    while (i < TOTAL && inFlight.size < CONCURRENCY) {
      const n = i++;
      const p = one(n).finally(() => inFlight.delete(p));
      inFlight.add(p);
    }
    if (inFlight.size > 0) await Promise.race(inFlight);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('─'.repeat(64));
  console.log(`Done — ${TOTAL} requests in ${elapsed}s`);
  console.log('Check the "key=N/M" log lines above to confirm rotation is working.\n');
}

run().catch(err => { console.error(err); process.exit(1); });
