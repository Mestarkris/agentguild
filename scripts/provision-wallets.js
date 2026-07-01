#!/usr/bin/env node
// Creates real Circle wallets on Arc testnet for all 12 agents and updates the DB.
// Skips agents that already have real (non-demo) wallets.
// Run after setup-circle.js with all env vars set.

require('dotenv').config({ path: require('path').join(__dirname, '../orchestrator/.env') });

const { initiateDeveloperControlledWalletsClient, Blockchain } = require('@circle-fin/developer-controlled-wallets');
const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const ARC = Blockchain.ArcTestnet;
const DB_PATH = path.join(__dirname, '../orchestrator/agentguild.db');

async function main() {
  const { CIRCLE_API_KEY: apiKey, CIRCLE_ENTITY_SECRET: entitySecret, CIRCLE_WALLET_SET_ID: walletSetId } = process.env;

  if (!apiKey || !entitySecret || !walletSetId) {
    console.error('ERROR: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, and CIRCLE_WALLET_SET_ID must all be set.');
    console.error('Run scripts/setup-circle.js first.');
    process.exit(1);
  }

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  const db = new Database(DB_PATH);

  const agents = db.prepare('SELECT * FROM agents ORDER BY id').all();
  const toProvision = agents.filter(a => !a.wallet_id || a.wallet_id.startsWith('demo_'));
  const alreadyReal = agents.filter(a => a.wallet_id && !a.wallet_id.startsWith('demo_'));

  console.log(`\nAgents with real wallets already: ${alreadyReal.length}`);
  console.log(`Agents needing provisioning:      ${toProvision.length}\n`);

  if (alreadyReal.length > 0) {
    for (const a of alreadyReal) {
      console.log(`  [SKIP] ${a.name} — wallet_id=${a.wallet_id}`);
    }
  }

  const update = db.prepare('UPDATE agents SET wallet_id = ?, wallet_address = ? WHERE id = ?');
  const results = [];

  for (const agent of toProvision) {
    process.stdout.write(`  [CREATING] ${agent.name.padEnd(20)}`);
    try {
      const res = await client.createWallets({
        walletSetId,
        blockchains: [ARC],
        count: 1,
        metadata: [{ name: `AgentGuild - ${agent.name}`, refId: agent.id }],
        idempotencyKey: uuidv4(),
      });
      const wallet = res.data?.wallets?.[0];
      if (!wallet) throw new Error('No wallet returned');

      update.run(wallet.id, wallet.address, agent.id);
      results.push({ name: agent.name, walletId: wallet.id, address: wallet.address });
      console.log(`✅  ${wallet.address}`);
    } catch (err) {
      console.log(`❌  ${err.message}`);
      results.push({ name: agent.name, error: err.message });
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  // Summary
  const succeeded = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  console.log('\n' + '='.repeat(60));
  console.log(`Provisioned: ${succeeded.length}/${toProvision.length} agents`);
  if (failed.length > 0) {
    console.log(`Failed: ${failed.map(f => f.name).join(', ')}`);
  }
  console.log('\nAll agent wallet addresses:');
  const all = db.prepare('SELECT name, wallet_address FROM agents ORDER BY id').all();
  for (const a of all) {
    console.log(`  ${a.name.padEnd(22)} ${a.wallet_address}`);
  }
  console.log('\n✅ Done. Restart the orchestrator to pick up the new wallet IDs.');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
