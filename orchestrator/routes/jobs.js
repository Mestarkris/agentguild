const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { getDb } = require('../db');
const { decomposeJob } = require('../services/planner');
const { selectAgent, estimateJobCost } = require('../services/router');
const { settleJob } = require('../services/settlement');

const router = express.Router();

const AGENT_URLS = {
  'summarizer':    process.env.AGENT_SUMMARIZER_URL    || 'http://localhost:4001',
  'code-review':   process.env.AGENT_CODE_REVIEW_URL   || 'http://localhost:4002',
  'research':      process.env.AGENT_RESEARCH_URL      || 'http://localhost:4003',
  'translate':     process.env.AGENT_TRANSLATE_URL     || 'http://localhost:4004',
  'sentiment':     process.env.AGENT_SENTIMENT_URL     || 'http://localhost:4005',
  'sql':           process.env.AGENT_SQL_URL           || 'http://localhost:4006',
  'chart':         process.env.AGENT_CHART_URL         || 'http://localhost:4007',
  'extract':       process.env.AGENT_EXTRACT_URL       || 'http://localhost:4008',
  'legal-review':  process.env.AGENT_LEGAL_REVIEW_URL  || 'http://localhost:4009',
  'finance':       process.env.AGENT_FINANCE_URL       || 'http://localhost:4010',
  'transcribe':    process.env.AGENT_TRANSCRIBE_URL    || 'http://localhost:4011',
  'fact-check':    process.env.AGENT_FACT_CHECK_URL    || 'http://localhost:4012',
};

router.get('/', (req, res) => {
  const db = getDb();
  const { status, limit = 50, search } = req.query;
  let sql = 'SELECT * FROM jobs';
  const params = [];
  const clauses = [];
  if (status && status !== 'all') { clauses.push('status = ?'); params.push(status); }
  if (search) { clauses.push('description LIKE ?'); params.push(`%${search}%`); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY submitted_at DESC LIMIT ?';
  params.push(Math.min(parseInt(limit) || 50, 200));
  res.json(db.prepare(sql).all(...params));
});

// SSE: real-time job stream
router.get('/:id/stream', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send() {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    if (!job) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'not found' })}\n\n`);
      clearInterval(timer);
      res.end();
      return;
    }
    const subtasks = db.prepare(`
      SELECT st.*, a.name as agent_name, a.skill
      FROM subtasks st LEFT JOIN agents a ON a.id = st.agent_id
      WHERE st.job_id = ? ORDER BY st.position
    `).all(id);
    res.write(`data: ${JSON.stringify({ ...job, subtasks })}\n\n`);
    if (job.status === 'completed' || job.status === 'failed') {
      clearInterval(timer);
      setTimeout(() => res.end(), 200);
    }
  }

  send();
  const timer = setInterval(send, 1000);
  req.on('close', () => clearInterval(timer));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const subtasks = db.prepare('SELECT st.*, a.name as agent_name, a.skill FROM subtasks st LEFT JOIN agents a ON a.id = st.agent_id WHERE st.job_id = ? ORDER BY st.position').all(req.params.id);
  res.json({ ...job, subtasks });
});

router.post('/', async (req, res) => {
  const { description } = req.body;
  if (!description?.trim()) return res.status(400).json({ error: 'description required' });

  const db = getDb();
  const jobId = uuidv4();

  db.prepare(`INSERT INTO jobs (id, description, status) VALUES (?, ?, 'pending')`).run(jobId, description);

  res.json({ jobId, status: 'pending', message: 'Job accepted, planning...' });

  // Run async so we can respond immediately (frontend polls for updates)
  runJob(jobId, description).catch(err => {
    console.error(`[Job ${jobId}] Fatal error:`, err.message);
    db.prepare(`UPDATE jobs SET status = 'failed', error = ? WHERE id = ?`).run(err.message, jobId);
  });
});

router.post('/:id/flag', (req, res) => {
  const { agent_id, reason } = req.body;
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  try {
    const { slashAgent } = require('../services/reputation');
    const result = slashAgent(agent_id, req.params.id, reason || 'Output flagged by requester');
    res.json({ slashed: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

async function runJob(jobId, description) {
  const db = getDb();

  // Phase 3: Plan
  db.prepare(`UPDATE jobs SET status = 'planning' WHERE id = ?`).run(jobId);
  const availableAgents = db.prepare(`SELECT * FROM agents WHERE status != 'offline'`).all();
  const plan = await decomposeJob(description, availableAgents);
  console.log(`[Job ${jobId}] Plan: ${plan.subtasks.length} subtasks — ${plan.reasoning}`);

  // Insert subtasks
  const insertSubtask = db.prepare(`
    INSERT INTO subtasks (id, job_id, agent_id, skill, prompt, complexity_weight, position, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `);

  const subtaskIds = [];
  for (const st of plan.subtasks) {
    const agent = selectAgent(st.skill, st.prompt);
    const stId = uuidv4();
    subtaskIds.push({ id: stId, agent, st });
    insertSubtask.run(stId, jobId, agent?.id || null, st.skill, st.prompt, st.complexity_weight, st.position);
  }

  const totalCost = estimateJobCost(plan.subtasks, availableAgents);
  db.prepare(`UPDATE jobs SET status = 'running', total_price_usdc = ? WHERE id = ?`).run(totalCost, jobId);

  // Phase 1/3: Execute subtasks in order
  let prevResult = '';
  for (const { id: stId, agent, st } of subtaskIds) {
    if (!agent) {
      db.prepare(`UPDATE subtasks SET status = 'failed', result = 'No agent available' WHERE id = ?`).run(stId);
      continue;
    }

    db.prepare(`UPDATE subtasks SET status = 'running', started_at = datetime('now') WHERE id = ?`).run(stId);

    try {
      const agentUrl = AGENT_URLS[st.skill];
      const payload = { prompt: st.prompt, context: prevResult };
      const resp = await axios.post(`${agentUrl}/run`, payload, {
        headers: { 'X-Payment': `USDC ${agent.price_usdc * st.complexity_weight} demo demo` },
        timeout: 60000,
      });

      const { result, tokensUsed = 100, qualityScore = 1.0 } = resp.data;
      db.prepare(`
        UPDATE subtasks SET status = 'completed', result = ?, tokens_used = ?, quality_score = ?,
        completed_at = datetime('now') WHERE id = ?
      `).run(result, tokensUsed, qualityScore, stId);

      const { updateQuality } = require('../services/reputation');
      updateQuality(agent.id, qualityScore);
      prevResult = result;
    } catch (err) {
      console.error(`[Job ${jobId}] Subtask ${stId} failed:`, err.message);
      db.prepare(`UPDATE subtasks SET status = 'failed', result = ? WHERE id = ?`)
        .run(err.message, stId);
    }
  }

  // Phase 4: Settle
  db.prepare(`UPDATE jobs SET status = 'settling' WHERE id = ?`).run(jobId);
  try {
    await settleJob(jobId, totalCost);
  } catch (err) {
    console.error(`[Job ${jobId}] Settlement failed:`, err.message);
    db.prepare(`UPDATE jobs SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).run(jobId);
  }
}

module.exports = router;
