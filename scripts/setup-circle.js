#!/usr/bin/env node
// Creates the AgentGuild wallet set, a funded platform wallet on Arc testnet,
// and discovers the USDC token ID. Prints values to paste into orchestrator/.env.
// Run ONCE after generate-entity-secret.js.

require('dotenv').config({ path: require('path').join(__dirname, '../orchestrator/.env') });

const { initiateDeveloperControlledWalletsClient, Blockchain } = require('@circle-fin/developer-controlled-wallets');
const { v4: uuidv4 } = require('uuid');

const ARC = Blockchain.ArcTestnet; // 'ARC-TESTNET'

async function main() {
  const { CIRCLE_API_KEY: apiKey, CIRCLE_ENTITY_SECRET: entitySecret } = process.env;
  if (!apiKey || !entitySecret) {
    console.error('ERROR: CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set in orchestrator/.env');
    console.error('Run scripts/generate-entity-secret.js first if you need an entity secret.');
    process.exit(1);
  }

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  // 1. Create wallet set
  console.log('\n[1/4] Creating wallet set "AgentGuild"...');
  const wsRes = await client.createWalletSet({ name: 'AgentGuild', idempotencyKey: uuidv4() });
  const walletSetId = wsRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error('createWalletSet returned no ID: ' + JSON.stringify(wsRes.data));
  console.log(`  ✅ Wallet set created: ${walletSetId}`);

  // 2. Create platform wallet on Arc testnet
  console.log('\n[2/4] Creating platform wallet on ARC-TESTNET...');
  const pwRes = await client.createWallets({
    walletSetId,
    blockchains: [ARC],
    count: 1,
    metadata: [{ name: 'AgentGuild Platform', refId: 'platform' }],
    idempotencyKey: uuidv4(),
  });
  const platformWallet = pwRes.data?.wallets?.[0];
  if (!platformWallet) throw new Error('createWallets returned no wallet: ' + JSON.stringify(pwRes.data));
  console.log(`  ✅ Platform wallet: ${platformWallet.id}`);
  console.log(`     Address: ${platformWallet.address}`);

  // 3. Request testnet USDC from Circle faucet
  console.log('\n[3/4] Requesting testnet USDC from Circle faucet...');
  let usdcTokenId = null;
  try {
    const faucetRes = await client.requestTestnetTokens({
      walletId: platformWallet.id,
      blockchain: ARC,
      nativeTokens: 0.01,   // gas
      usdcTokens: 10,        // $10 USDC for demo payments
    });
    console.log('  ✅ Faucet response:', JSON.stringify(faucetRes.data ?? faucetRes));

    // Extract USDC token ID from faucet response if present
    const tokens = faucetRes.data?.tokens ?? [];
    const usdc = tokens.find(t => t.symbol === 'USDC' || t.name?.includes('USD Coin'));
    if (usdc?.id) {
      usdcTokenId = usdc.id;
      console.log(`  ✅ USDC token ID: ${usdcTokenId}`);
    }
  } catch (err) {
    console.warn('  ⚠️  Faucet request failed (may not be supported):', err.message);
    console.warn('     You may need to fund the platform wallet manually or use the Circle console.');
  }

  // 4. Try to discover USDC token ID via wallet balance if faucet didn't return it
  if (!usdcTokenId) {
    console.log('\n[4/4] Discovering USDC token ID from wallet balance...');
    console.log('  Waiting 5s for faucet to settle...');
    await new Promise(r => setTimeout(r, 5000));
    try {
      const balRes = await client.getWalletTokenBalance({ id: platformWallet.id });
      const balTokens = balRes.data?.tokenBalances ?? [];
      console.log('  Token balances:', JSON.stringify(balTokens.map(t => ({ symbol: t.token?.symbol, id: t.token?.id }))));
      const usdc = balTokens.find(t => t.token?.symbol === 'USDC' || t.token?.name?.includes('USD Coin'));
      if (usdc?.token?.id) {
        usdcTokenId = usdc.token.id;
        console.log(`  ✅ USDC token ID: ${usdcTokenId}`);
      }
    } catch (err) {
      console.warn('  ⚠️  Balance check failed:', err.message);
    }
  }

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('ADD THESE TO orchestrator/.env:');
  console.log('='.repeat(60));
  console.log(`CIRCLE_WALLET_SET_ID=${walletSetId}`);
  console.log(`PLATFORM_WALLET_ID=${platformWallet.id}`);
  if (usdcTokenId) {
    console.log(`CIRCLE_USDC_TOKEN_ID=${usdcTokenId}`);
  } else {
    console.log('# CIRCLE_USDC_TOKEN_ID=<find in Circle Console → Tokens → ARC-TESTNET USDC>');
  }
  console.log('\nPlatform wallet address (for reference):');
  console.log(`  ${platformWallet.address}`);
  console.log('\nNext: run  node scripts/provision-wallets.js');
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  if (e.response?.data) console.error('Circle API response:', JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
