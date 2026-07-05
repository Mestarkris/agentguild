#!/usr/bin/env node
// Probe all configured Groq keys and report remaining daily capacity from response headers.
'use strict';

require(require('path').join(__dirname, '../orchestrator/node_modules/dotenv')).config({
  path: require('path').join(__dirname, '../orchestrator/.env'),
});

const GROQ_MODEL = 'llama-3.3-70b-versatile';

function getKeys() {
  const keys = [];
  for (let i = 1; i <= 5; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k && k.trim()) keys.push({ label: `key_${i}`, key: k.trim() });
  }
  const single = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim();
  if (keys.length === 0 && single) keys.push({ label: 'key_legacy', key: single });
  return keys;
}

function fmtReset(resetStr) {
  if (!resetStr) return 'unknown';
  // Groq returns values like "1m30s" or "59.9s"
  return resetStr;
}

async function probe(label, apiKey) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      max_tokens: 4,
    }),
  });

  const headers = resp.headers;
  const h = (name) => headers.get(name) || headers.get(name.toLowerCase()) || null;

  const result = {
    label,
    status: resp.status,
    ok: resp.ok,
    // Minute-level limits
    limitReqMin:  h('x-ratelimit-limit-requests'),
    remainReqMin: h('x-ratelimit-remaining-requests'),
    limitTokMin:  h('x-ratelimit-limit-tokens'),
    remainTokMin: h('x-ratelimit-remaining-tokens'),
    resetReqMin:  h('x-ratelimit-reset-requests'),
    resetTokMin:  h('x-ratelimit-reset-tokens'),
    // Day-level limits (Groq also exposes these)
    limitReqDay:  h('x-ratelimit-limit-requests-day') || h('x-ratelimit-limit-requests-per-day'),
    remainReqDay: h('x-ratelimit-remaining-requests-day') || h('x-ratelimit-remaining-requests-per-day'),
    limitTokDay:  h('x-ratelimit-limit-tokens-day') || h('x-ratelimit-limit-tokens-per-day'),
    remainTokDay: h('x-ratelimit-remaining-tokens-day') || h('x-ratelimit-remaining-tokens-per-day'),
  };

  // Dump all rate-limit headers we get for debugging
  const allHeaders = {};
  for (const [k, v] of resp.headers.entries()) {
    if (k.includes('ratelimit') || k.includes('rate-limit') || k.includes('retry')) {
      allHeaders[k] = v;
    }
  }
  result.rawHeaders = allHeaders;

  if (!resp.ok) {
    const body = await resp.text();
    result.errorBody = body;
  } else {
    const data = await resp.json();
    result.tokensUsed = (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0);
  }

  return result;
}

async function main() {
  const keys = getKeys();
  console.log(`\nGroq daily capacity check — ${new Date().toUTCString()}`);
  console.log(`Probing ${keys.length} key(s) with a 4-token request each...\n`);

  const results = [];
  for (const { label, key } of keys) {
    try {
      const r = await probe(label, key);
      results.push(r);
    } catch (err) {
      results.push({ label, status: 'network-error', error: err.message });
    }
  }

  console.log('─'.repeat(72));

  let totalRemainTok = 0;
  let totalLimitTok  = 0;
  let anyDayDataFound = false;

  for (const r of results) {
    console.log(`\n[${r.label}]  HTTP ${r.status}${r.ok ? ' ✓' : ' ✗'}`);

    if (r.error) {
      console.log(`  ERROR: ${r.error}`);
      continue;
    }
    if (!r.ok) {
      console.log(`  Response: ${r.errorBody?.slice(0, 200)}`);
    }

    // Print all rate-limit headers we received
    if (Object.keys(r.rawHeaders || {}).length > 0) {
      console.log('  Rate-limit headers:');
      for (const [k, v] of Object.entries(r.rawHeaders)) {
        console.log(`    ${k}: ${v}`);
      }
    } else {
      console.log('  (no rate-limit headers in response)');
    }

    // Try to extract day-level numbers
    const limitDay  = parseInt(r.limitTokDay)  || null;
    const remainDay = parseInt(r.remainTokDay) || null;
    if (limitDay !== null && remainDay !== null) {
      anyDayDataFound = true;
      totalLimitTok  += limitDay;
      totalRemainTok += remainDay;
      const usedDay = limitDay - remainDay;
      const pct = ((usedDay / limitDay) * 100).toFixed(1);
      console.log(`  Daily tokens:  ${remainDay.toLocaleString()} / ${limitDay.toLocaleString()} remaining  (${pct}% used)`);
    }

    // Print minute-level as a proxy if no day-level
    const limitMin  = parseInt(r.limitTokMin)  || null;
    const remainMin = parseInt(r.remainTokMin) || null;
    if (limitMin !== null && remainMin !== null) {
      const usedMin = limitMin - remainMin;
      console.log(`  Per-min tokens: ${remainMin.toLocaleString()} / ${limitMin.toLocaleString()} remaining  (${usedMin} used this window, resets in ${fmtReset(r.resetTokMin)})`);
    }

    const limitReqMin  = parseInt(r.limitReqMin)  || null;
    const remainReqMin = parseInt(r.remainReqMin) || null;
    if (limitReqMin !== null && remainReqMin !== null) {
      console.log(`  Per-min reqs:   ${remainReqMin} / ${limitReqMin} remaining  (resets in ${fmtReset(r.resetReqMin)})`);
    }
  }

  console.log('\n' + '─'.repeat(72));
  console.log('\nSUMMARY');

  if (anyDayDataFound) {
    const usedTotal = totalLimitTok - totalRemainTok;
    const pctUsed   = ((usedTotal / totalLimitTok) * 100).toFixed(1);
    console.log(`  Total daily token budget : ${totalLimitTok.toLocaleString()}`);
    console.log(`  Used today               : ${usedTotal.toLocaleString()}  (${pctUsed}%)`);
    console.log(`  REMAINING                : ${totalRemainTok.toLocaleString()} tokens across ${results.length} keys`);

    // Estimate: ~20-30 jobs via seed-traction. Each job = 2-4 subtasks, each subtask ~800 tokens avg.
    const tokPerSubtask = 800;
    const subtasksPerJob = 3; // midpoint of 2-4
    const seedJobsLow = 20, seedJobsHigh = 30;
    const seedTokLow  = seedJobsLow  * subtasksPerJob * tokPerSubtask;
    const seedTokHigh = seedJobsHigh * subtasksPerJob * tokPerSubtask;

    // Demo: ~10 jobs live, each 3 subtasks
    const demoJobs = 10;
    const demoTok  = demoJobs * subtasksPerJob * tokPerSubtask;

    const totalNeeded = seedTokHigh + demoTok;

    console.log(`\n  ESTIMATES (800 tok/subtask × 3 subtasks/job):`);
    console.log(`    Seed run (20-30 jobs) : ${seedTokLow.toLocaleString()} – ${seedTokHigh.toLocaleString()} tokens`);
    console.log(`    Demo recording (~10 live jobs) : ${demoTok.toLocaleString()} tokens`);
    console.log(`    Total worst-case needed : ${totalNeeded.toLocaleString()} tokens`);
    console.log(`\n  VERDICT: ${totalRemainTok >= totalNeeded ? '✓ ENOUGH capacity.' : '✗ SHORT — ' + (totalNeeded - totalRemainTok).toLocaleString() + ' tokens deficit.'}`);
  } else {
    console.log(`  NOTE: Groq did not return day-level headers in these responses.`);
    console.log(`  Check the raw per-minute headers above for current window state.`);
    console.log(`  Groq free tier is 500K tokens/day per key = 2.5M total across 5 keys.`);
    console.log(`  (Day-level headers may only appear on 429 responses or in org-level API.)\n`);
  }

  console.log('');
}

main().catch(err => { console.error(err); process.exit(1); });
