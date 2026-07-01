const { initiateDeveloperControlledWalletsClient, Blockchain } = require('@circle-fin/developer-controlled-wallets');
const { v4: uuidv4 } = require('uuid');

const ARC_CONFIG = {
  chainId: parseInt(process.env.ARC_CHAIN_ID || '1111'),
  rpcUrl: process.env.ARC_RPC_URL || 'https://arc-node.thecanteenapp.com',
};

function isConfigured() {
  return !!(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET);
}

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
}

function getWalletSetId() {
  const id = process.env.CIRCLE_WALLET_SET_ID;
  if (!id) throw new Error('CIRCLE_WALLET_SET_ID not set in .env');
  return id;
}

async function createAgentWallet(agentId, agentName) {
  if (!isConfigured()) {
    return {
      walletId: `demo_wallet_${agentId.slice(0, 8)}`,
      walletAddress: `0xAGENT${agentId.slice(0, 8).toUpperCase()}`,
      demo: true,
    };
  }

  const client = getClient();
  const res = await client.createWallets({
    walletSetId: getWalletSetId(),
    blockchains: [Blockchain.ArcTestnet],
    count: 1,
    metadata: [{ name: `AgentGuild - ${agentName}`, refId: agentId }],
  });

  const wallet = res.data?.wallets?.[0];
  if (!wallet) throw new Error('Circle returned no wallet');
  console.log(`[Circle] Created wallet for ${agentName}: ${wallet.address}`);
  return { walletId: wallet.id, walletAddress: wallet.address };
}

async function getWalletBalance(walletId) {
  if (!isConfigured() || walletId?.startsWith('demo_')) {
    return { usdc: (Math.random() * 5).toFixed(4) };
  }
  try {
    const client = getClient();
    const res = await client.getWalletTokenBalance({ id: walletId });
    const usdc = res.data?.tokenBalances?.find(b =>
      b.token?.symbol === 'USDC' || b.token?.name?.includes('USD Coin')
    );
    return { usdc: usdc?.amount || '0' };
  } catch (err) {
    console.error('[Circle] Balance check failed:', err.message);
    return { usdc: '0' };
  }
}

async function executeAgentSplits(splits, jobId) {
  const settledAt = new Date().toISOString();
  const platformWalletId = process.env.PLATFORM_WALLET_ID;
  const usdcTokenId = process.env.CIRCLE_USDC_TOKEN_ID;

  const isDemo = !isConfigured() || !platformWalletId || !usdcTokenId ||
    platformWalletId === 'your_platform_wallet_id';

  if (isDemo) {
    console.log(`[Arc] Demo: simulating ${splits.length} agent nanopayments for job ${jobId}`);
    const txMap = {};
    for (const s of splits) {
      txMap[s.agentId] = `0xARC${Date.now().toString(16).toUpperCase()}${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
    }
    return { txMap, settledAt, demo: true };
  }

  const client = getClient();
  const ref = splits.find(s => s.walletAddress && !s.walletAddress.startsWith('0xAGENT'));
  if (!ref) {
    console.warn('[Arc] No real wallet addresses found — falling back to demo settlement');
    const txMap = {};
    for (const s of splits) {
      txMap[s.agentId] = `0xARC${Date.now().toString(16).toUpperCase()}${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
    }
    return { txMap, settledAt, demo: true };
  }

  // Estimate fee once using a representative split
  let feeConfig = null;
  try {
    const feeEst = await client.estimateTransferFee({
      walletId: platformWalletId,
      tokenId: usdcTokenId,
      destinationAddress: ref.walletAddress,
      amounts: [ref.usdcAmount.toFixed(6)],
    });
    const med = feeEst.data?.medium;
    if (med) feeConfig = { gasLimit: med.gasLimit, priorityFee: med.priorityFee, maxFee: med.maxFee };
  } catch (err) {
    console.warn('[Arc] Fee estimation failed, proceeding without explicit fee config:', err.message);
  }

  // Send one transaction per agent
  const circleIdMap = {}; // agentId → Circle transaction UUID
  for (const s of splits) {
    if (!s.walletAddress || s.walletAddress.startsWith('0xAGENT')) continue;
    try {
      const txReq = {
        walletId: platformWalletId,
        tokenId: usdcTokenId,
        destinationAddress: s.walletAddress,
        amounts: [s.usdcAmount.toFixed(6)],
        idempotencyKey: uuidv4(),
      };
      if (feeConfig) txReq.fee = { type: 'EIP1559', config: feeConfig };

      const res = await client.createTransaction(txReq);
      const circleTxId = res.data?.id ?? res.data?.transaction?.id;
      circleIdMap[s.agentId] = circleTxId;
      console.log(`[Arc] Created tx ${circleTxId} → ${s.walletAddress} ($${s.usdcAmount.toFixed(6)} USDC)`);
    } catch (err) {
      console.error(`[Arc] Transaction failed for agent ${s.agentId}:`, err.message);
    }
  }

  // Poll for on-chain tx hashes (up to 30s)
  console.log('[Arc] Polling for on-chain tx hashes...');
  const txMap = await pollForTxHashes(client, circleIdMap, 30000);

  return { txMap, settledAt, demo: false };
}

async function pollForTxHashes(client, circleIdMap, timeoutMs) {
  const txMap = {};
  const pending = { ...circleIdMap };
  const deadline = Date.now() + timeoutMs;

  // Initialize with Circle tx IDs as fallback
  for (const [agentId, circleTxId] of Object.entries(circleIdMap)) {
    if (circleTxId) txMap[agentId] = circleTxId;
  }

  while (Object.keys(pending).length > 0 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    for (const [agentId, circleTxId] of Object.entries(pending)) {
      if (!circleTxId) { delete pending[agentId]; continue; }
      try {
        const res = await client.getTransaction({ id: circleTxId });
        const tx = res.data?.transaction;
        if (tx?.txHash) {
          txMap[agentId] = tx.txHash; // real on-chain hash
          console.log(`[Arc] Confirmed tx hash for agent ${agentId}: ${tx.txHash}`);
          delete pending[agentId];
        } else if (tx?.state === 'FAILED' || tx?.state === 'CANCELLED') {
          console.warn(`[Arc] Tx ${circleTxId} ended in state ${tx.state}`);
          delete pending[agentId];
        }
      } catch {
        // ignore transient errors during polling
      }
    }
  }

  if (Object.keys(pending).length > 0) {
    console.warn(`[Arc] ${Object.keys(pending).length} tx(es) still pending after timeout — stored Circle IDs as fallback`);
  }

  return txMap;
}

module.exports = { createAgentWallet, getWalletBalance, executeAgentSplits, ARC_CONFIG };
