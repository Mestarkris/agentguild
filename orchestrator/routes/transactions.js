const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { agent_id, job_id, limit = 100 } = req.query;

  let sql = `
    SELECT t.*, a.name as agent_name, a.skill as agent_skill,
           j.description as job_description
    FROM transactions t
    LEFT JOIN agents a ON a.id = t.agent_id
    LEFT JOIN jobs j ON j.id = t.job_id
  `;
  const params = [];
  const clauses = [];
  if (agent_id) { clauses.push('t.agent_id = ?'); params.push(agent_id); }
  if (job_id) { clauses.push('t.job_id = ?'); params.push(job_id); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY t.created_at DESC LIMIT ?';
  params.push(Math.min(parseInt(limit) || 100, 500));

  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
