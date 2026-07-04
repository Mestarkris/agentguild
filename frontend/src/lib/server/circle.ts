import { initiateDeveloperControlledWalletsClient, Blockchain } from '@circle-fin/developer-controlled-wallets';
import { v4 as uuidv4 } from 'uuid';

export function isConfigured() {
  return !!(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET);
}

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  });
}

export async function createAgentWallet(agentId: string, agentName: string) {
  if (!isConfigured()) {
    return {
      walletId: `demo_wallet_${agentId.slice(0, 8)}`,
      walletAddress: `0xAGENT${agentId.slice(0, 8).toUpperCase()}`,
    };
  }
  const client = getClient();
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (!walletSetId) throw new Error('CIRCLE_WALLET_SET_ID not set');
  const res = await client.createWallets({
    walletSetId,
    blockchains: [Blockchain.ArcTestnet],
    count: 1,
    metadata: [{ name: `AgentGuild - ${agentName}`, refId: agentId }],
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet) throw new Error('Circle returned no wallet');
  return { walletId: wallet.id, walletAddress: wallet.address };
}

interface Split {
  agentId: string;
  walletAddress: string;
  usdcAmount: number;
  subtaskId: string;
}

export async function executeAgentSplits(splits: Split[], jobId: string) {
  const settledAt = new Date().toISOString();
  const platformWalletId = process.env.PLATFORM_WALLET_ID;
  const usdcTokenId = process.env.CIRCLE_USDC_TOKEN_ID;

  const isDemo = !isConfigured() || !platformWalletId || !usdcTokenId ||
    platformWalletId === 'your_platform_wallet_id';

  if (isDemo) {
    console.log(`[Arc] Demo: simulating ${splits.length} agent nanopayments for job ${jobId}`);
    const txMap: Record<string, string> = {};
    for (const s of splits) {
      txMap[s.agentId] = `0xARC${Date.now().toString(16).toUpperCase()}${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
    }
    return { txMap, settledAt, demo: true };
  }

  const client = getClient();
  const ref = splits.find(s => s.walletAddress && !s.walletAddress.startsWith('0xAGENT'));
  if (!ref) {
    const txMap: Record<string, string> = {};
    for (const s of splits) {
      txMap[s.agentId] = `0xARC${Date.now().toString(16).toUpperCase()}${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
    }
    return { txMap, settledAt, demo: true };
  }

  let feeConfig: { gasLimit: string; priorityFee: string; maxFee: string } | null = null;
  try {
    const feeEst = await client.estimateTransferFee({
      walletId: platformWalletId!,
      tokenId: usdcTokenId!,
      destinationAddress: ref.walletAddress,
      amount: [ref.usdcAmount.toFixed(6)],
    } as Parameters<typeof client.estimateTransferFee>[0]);
    const med = feeEst.data?.medium;
    if (med) feeConfig = { gasLimit: med.gasLimit!, priorityFee: med.priorityFee!, maxFee: med.maxFee! };
  } catch { /* proceed without fee config */ }

  const circleIdMap: Record<string, string> = {};
  for (const s of splits) {
    if (!s.walletAddress || s.walletAddress.startsWith('0xAGENT')) continue;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txReq: any = {
        walletId: platformWalletId!,
        tokenId: usdcTokenId!,
        destinationAddress: s.walletAddress,
        amounts: [s.usdcAmount.toFixed(6)],
        idempotencyKey: uuidv4(),
      };
      if (feeConfig) txReq.fee = { type: 'EIP1559', config: feeConfig };
      const res = await client.createTransaction(txReq);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = res.data as any;
      const circleTxId: string | undefined = d?.id ?? d?.transaction?.id;
      if (circleTxId) circleIdMap[s.agentId] = circleTxId;
    } catch (err) {
      console.error(`[Arc] Transaction failed for agent ${s.agentId}:`, (err as Error).message);
    }
  }

  const txMap = await pollForTxHashes(client, circleIdMap, 30000);
  return { txMap, settledAt, demo: false };
}

async function pollForTxHashes(
  client: ReturnType<typeof getClient>,
  circleIdMap: Record<string, string>,
  timeoutMs: number
): Promise<Record<string, string>> {
  const txMap: Record<string, string> = { ...circleIdMap };
  const pending = { ...circleIdMap };
  const deadline = Date.now() + timeoutMs;

  while (Object.keys(pending).length > 0 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    for (const [agentId, circleTxId] of Object.entries(pending)) {
      if (!circleTxId) { delete pending[agentId]; continue; }
      try {
        const res = await client.getTransaction({ id: circleTxId });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = (res.data as any)?.transaction;
        if (tx?.txHash) {
          txMap[agentId] = tx.txHash as string;
          delete pending[agentId];
        } else if (tx?.state === 'FAILED' || tx?.state === 'CANCELLED') {
          delete pending[agentId];
        }
      } catch { /* ignore transient */ }
    }
  }
  return txMap;
}
