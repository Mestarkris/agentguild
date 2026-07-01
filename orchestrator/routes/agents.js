const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { createAgentWallet, getWalletBalance } = require('../services/circle');
const { slashAgent, getBondStatus } = require('../services/reputation');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const agents = db.prepare('SELECT * FROM agents ORDER BY skill, name').all();
  res.json(agents);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

router.get('/:id/bond', (req, res) => {
  const status = getBondStatus(req.params.id);
  if (!status) return res.status(404).json({ error: 'Agent not found' });
  res.json(status);
});

router.get('/:id/balance', async (req, res) => {
  const db = getDb();
  const agent = db.prepare('SELECT wallet_id FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const balance = await getWalletBalance(agent.wallet_id);
  res.json(balance);
});

router.post('/:id/slash', (req, res) => {
  const { reason, job_id } = req.body;
  try {
    const result = slashAgent(req.params.id, job_id, reason || 'Manual flag');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
