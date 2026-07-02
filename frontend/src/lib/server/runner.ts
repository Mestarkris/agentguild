import { v4 as uuidv4 } from 'uuid';
import { query, exec, flushNow } from './db';
import { decomposeJob } from './planner';
import { runAgentInline } from './agents';
import { executeAgentSplits } from './circle';

const SLASH_AMOUNT = 0.01;
const MIN_BOND = 0.01;

interface SubtaskRow {
  id: string;
  agent_id: string;
  wallet_address: string;
  tokens_used: number;
  complexity_weight: number;
  quality_score: number;
  position: number;
  result: string | null;
  [key: string]: unknown;
}

interface ScoredRow extends SubtaskRow {
  raw_score: number;
  contribution_pct: number;
  payment_usdc: number;
}

function scoreAndAllocate(subtasks: SubtaskRow[], totalBudget: number): ScoredRow[] {
  const scored = subtasks.map(st => ({
    ...st,
    raw_score: Math.min(st.tokens_used / 1000, 5) * st.complexity_weight * (st.quality_score || 1.0),
  }));
  const totalRaw = scored.reduce((s, st) => s + st.raw_score, 0);
  const even = 1 / scored.length;
  return scored.map(st => {
    const pct = totalRaw === 0 ? even : st.raw_score / totalRaw;
    return { ...st, contribution_pct: pct, payment_usdc: parseFloat((pct * totalBudget).toFixed(6)) };
  });
}

export async function runJob(jobId: string, description: string) {
  await exec('UPDATE jobs SET status = ? WHERE id = ?', ['planning', jobId]);
  const agents = await query('SELECT * FROM agents WHERE status != ?', ['offline']);
  const plan = await decomposeJob(description, agents as unknown as Parameters<typeof decomposeJob>[1]);

  const subtaskRows: { id: string; agentId: string | null; st: (typeof plan.subtasks)[0] }[] = [];
  for (const st of plan.subtasks) {
    const rows = await query(
      'SELECT * FROM agents WHERE skill = ? AND status = ? ORDER BY avg_quality DESC, price_usdc ASC LIMIT 1',
      [st.skill, 'available']
    );
    const agent = rows[0] ?? null;
    const stId = uuidv4();
    subtaskRows.push({ id: stId, agentId: (agent?.id as string) ?? null, st });
    await exec(
      'INSERT INTO subtasks (id, job_id, agent_id, skill, prompt, complexity_weight, position, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [stId, jobId, (agent?.id as string) ?? null, st.skill, st.prompt, st.complexity_weight, st.position, 'pending']
    );
  }

  let totalCost = 0;
  for (const { agentId, st } of subtaskRows) {
    if (!agentId) continue;
    const rows = await query('SELECT price_usdc FROM agents WHERE id = ?', [agentId]);
    if (rows[0]) totalCost += (rows[0].price_usdc as number) * st.complexity_weight;
  }
  totalCost = parseFloat(totalCost.toFixed(6));
  await exec('UPDATE jobs SET status = ?, total_price_usdc = ? WHERE id = ?', ['running', totalCost, jobId]);

  let prevResult = '';
  for (const { id: stId, agentId, st } of subtaskRows) {
    if (!agentId) {
      await exec('UPDATE subtasks SET status = ?, result = ? WHERE id = ?', ['failed', 'No agent available', stId]);
      continue;
    }
    await exec('UPDATE subtasks SET status = ?, started_at = ? WHERE id = ?', ['running', new Date().toISOString(), stId]);
    try {
      const { result, tokensUsed, qualityScore } = await runAgentInline(st.skill, st.prompt, prevResult);
      await exec(
        'UPDATE subtasks SET status = ?, result = ?, tokens_used = ?, quality_score = ?, completed_at = ? WHERE id = ?',
        ['completed', result, tokensUsed, qualityScore, new Date().toISOString(), stId]
      );
      await exec(
        'UPDATE agents SET avg_quality = MIN(1.0, MAX(0.1, avg_quality * 0.9 + ? * 0.1)) WHERE id = ?',
        [qualityScore, agentId]
      );
      prevResult = result;
    } catch (err) {
      await exec('UPDATE subtasks SET status = ?, result = ? WHERE id = ?', ['failed', (err as Error).message, stId]);
    }
  }

  await exec('UPDATE jobs SET status = ? WHERE id = ?', ['settling', jobId]);

  // Compute final result before payment so it's available even if settlement throws
  let finalResult: string | null = null;

  try {
    const completedSubs = await query(
      `SELECT st.*, a.wallet_address, a.name as agent_name
       FROM subtasks st JOIN agents a ON a.id = st.agent_id
       WHERE st.job_id = ? AND st.status = ?`,
      [jobId, 'completed']
    ) as SubtaskRow[];

    if (completedSubs.length === 0) {
      await exec(
        'UPDATE jobs SET status = ?, error = ?, completed_at = ? WHERE id = ?',
        ['failed', 'All subtasks failed — no output produced', new Date().toISOString(), jobId]
      );
      await flushNow();
      return;
    }

    const allocated = scoreAndAllocate(completedSubs, totalCost);

    // Grab the final result before the payment call so the catch block can save it
    finalResult = [...allocated].sort((a, b) => a.position - b.position).at(-1)?.result ?? null;

    const splits = allocated.map(st => ({
      agentId: st.agent_id,
      walletAddress: st.wallet_address,
      usdcAmount: st.payment_usdc,
      subtaskId: st.id,
    }));

    const { txMap, settledAt, demo } = await executeAgentSplits(splits, jobId);

    for (const st of allocated) {
      const txHash = txMap[st.agent_id] ?? null;
      await exec(
        'UPDATE subtasks SET contribution_pct = ?, payment_usdc = ?, payment_tx = ?, status = ? WHERE id = ?',
        [st.contribution_pct, st.payment_usdc, txHash, 'settled', st.id]
      );
      await exec(
        'UPDATE agents SET total_earned = total_earned + ?, total_jobs = total_jobs + 1, last_active = ? WHERE id = ?',
        [st.payment_usdc, new Date().toISOString(), st.agent_id]
      );
      await exec(
        'INSERT INTO transactions (id, job_id, agent_id, amount_usdc, tx_hash, demo) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), jobId, st.agent_id, st.payment_usdc, txHash, demo ? 1 : 0]
      );
    }

    await exec('UPDATE jobs SET status = ?, completed_at = ?, result = ? WHERE id = ?', ['completed', settledAt, finalResult, jobId]);
    console.log(`[Settlement] Job ${jobId} settled: $${totalCost} across ${allocated.length} agents (demo=${demo})`);
    await flushNow();
  } catch (err) {
    console.error(`[Job ${jobId}] Settlement failed:`, (err as Error).message);
    // Still persist whatever result was computed before payment threw
    await exec(
      'UPDATE jobs SET status = ?, completed_at = ?, result = ? WHERE id = ?',
      ['completed', new Date().toISOString(), finalResult, jobId]
    );
    await flushNow();
  }
}

export async function slashAgent(agentId: string, jobId: string | null, reason: string) {
  const rows = await query('SELECT bond_amount, bond_slashed FROM agents WHERE id = ?', [agentId]) as { bond_amount: number; bond_slashed: number }[];
  if (!rows[0]) throw new Error(`Agent ${agentId} not found`);
  const { bond_amount, bond_slashed } = rows[0];
  const currentBond = bond_amount - bond_slashed;
  if (currentBond <= MIN_BOND) return { slashed: 0, newBond: currentBond };
  const slashAmt = Math.min(SLASH_AMOUNT, currentBond - MIN_BOND);
  await exec('UPDATE agents SET bond_slashed = bond_slashed + ?, avg_quality = MAX(0.1, avg_quality - 0.1) WHERE id = ?', [slashAmt, agentId]);
  await exec('INSERT INTO bond_slashes (id, agent_id, job_id, slash_amount, reason) VALUES (?, ?, ?, ?, ?)', [uuidv4(), agentId, jobId, slashAmt, reason]);
  return { slashed: slashAmt, newBond: currentBond - slashAmt };
}
