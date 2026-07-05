#!/usr/bin/env node
/**
 * Parallel stress test: submit N auto-decompose jobs simultaneously and confirm
 * all complete without 429 errors even with the global LLM rate-limiting queue active.
 *
 * Usage:
 *   node scripts/test-parallel-jobs.js [--jobs 3] [--base-url http://localhost:3000]
 *
 * Expected output: all jobs complete, zero 429 failures, throughput visible in
 * [LLMQueue] log lines on the orchestrator/agent consoles.
 */

'use strict';

const BASE_URL = (() => {
  const i = process.argv.indexOf('--base-url');
  return i !== -1 ? process.argv[i + 1] : 'http://localhost:3000';
})();

const NUM_JOBS = (() => {
  const i = process.argv.indexOf('--jobs');
  return i !== -1 ? parseInt(process.argv[i + 1], 10) : 3;
})();

const JOB_DESCRIPTIONS = [
  'Research the history of USDC stablecoin from 2018 to 2025 and summarize the key milestones for a non-technical audience',
  'Review this Python code for SQL injection vulnerabilities:\n\ndef get_user(uid):\n    return db.execute(f"SELECT * FROM users WHERE id = {uid}").fetchone()\n\nThen fact-check whether SQL injection is still the #1 OWASP risk in 2024.',
  'Analyze the sentiment of these customer reviews, then generate a finance KPI memo:\n"Love the product — saves hours each week!"\n"Support team is unresponsive. Will not renew."\n"Good value but the UI needs polish."\n"Best decision we made this year."',
  'Research the top 3 ZK-rollup projects (zkSync, StarkNet, Polygon zkEVM), extract their TPS benchmarks, then summarize for a VC memo',
  'Summarize the x402 payment protocol: HTTP-native payments where a server returns 402 with a payment address, client pays, then re-requests. Extract the core protocol fields into structured JSON.',
];

async function httpPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function httpGet(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForJob(jobId, maxWaitMs = 180000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await sleep(2000);
    const job = await httpGet(`/api/jobs/${jobId}`);
    if (job.status === 'completed' || job.status === 'failed') return job;
  }
  return null;
}

async function runJob(description, idx) {
  const label = `job-${idx + 1}`;
  const preview = description.slice(0, 55).replace(/\n/g, ' ');
  const t0 = Date.now();

  let jobId;
  try {
    ({ jobId } = await httpPost('/api/jobs', { description }));
  } catch (err) {
    console.error(`[${label}] submit failed: ${err.message}`);
    return { status: 'submit-error', elapsed: 0 };
  }

  console.log(`[${label}] submitted ${jobId.slice(0, 8)} — "${preview}…"`);

  const job = await waitForJob(jobId);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  if (!job) {
    console.warn(`[${label}] TIMEOUT after ${elapsed}s (job ${jobId.slice(0, 8)} still running)`);
    return { status: 'timeout', elapsed };
  }

  const n = job.subtasks?.length ?? 0;
  const usdc = job.total_price_usdc?.toFixed(5) ?? '?';
  const icon = job.status === 'completed' ? '✓' : '✗';
  console.log(`[${label}] ${icon} ${job.status} in ${elapsed}s  ${n} subtask(s)  $${usdc} USDC`);
  return { status: job.status, elapsed: parseFloat(elapsed), subtasks: n, usdc };
}

async function main() {
  const jobs = JOB_DESCRIPTIONS.slice(0, NUM_JOBS);

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  Parallel job stress test  (${jobs.length} simultaneous jobs)  ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Target : ${BASE_URL}`);
  console.log('  Watch the orchestrator + agent logs for [LLMQueue] lines\n');

  try {
    await httpGet('/api/agents');
  } catch (e) {
    console.error(`Cannot reach ${BASE_URL} — is the orchestrator running?`);
    console.error(e.message);
    process.exit(1);
  }

  const t0 = Date.now();

  // Submit all jobs at the same time — this is the stress test
  const results = await Promise.all(jobs.map((desc, i) => runJob(desc, i)));

  const totalMs = Date.now() - t0;
  const completed = results.filter(r => r.status === 'completed').length;
  const failed    = results.filter(r => r.status === 'failed').length;
  const timedOut  = results.filter(r => r.status === 'timeout').length;
  const errored   = results.filter(r => r.status === 'submit-error').length;

  console.log('\n' + '═'.repeat(54));
  console.log(`  ${jobs.length} jobs · wall time ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`  ✓ completed : ${completed}`);
  if (failed)   console.log(`  ✗ failed    : ${failed}`);
  if (timedOut) console.log(`  ⏱ timeout  : ${timedOut}`);
  if (errored)  console.log(`  ! error     : ${errored}`);

  if (completed === jobs.length) {
    console.log('\n  All jobs completed — zero 429 failures under parallel load ✓');
  } else {
    console.log('\n  Some jobs did not complete. Check orchestrator logs for 429s.');
    process.exitCode = 1;
  }
  console.log('═'.repeat(54) + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
