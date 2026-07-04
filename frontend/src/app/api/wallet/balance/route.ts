import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const USDC_CONTRACT = '0x3600000000000000000000000000000000000000';
const ARC_RPC       = 'https://testnet.arcscan.app/api/eth-rpc';

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'invalid address' }, { status: 400 });
  }

  // Real on-chain eth_call: balanceOf(address) on USDC ERC-20
  const padded = address.slice(2).padStart(64, '0');
  const data = '0x70a08231' + padded;

  try {
    const rpcRes = await fetch(ARC_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: USDC_CONTRACT, data }, 'latest'] }),
      cache: 'no-store',
    });

    const rpcData = await rpcRes.json() as { result?: string; error?: unknown };
    if (rpcData.error || !rpcData.result || rpcData.result === '0x') {
      return NextResponse.json({ usdc: '0.000000', address, network: 'arc-testnet', demo: false });
    }

    const raw = BigInt(rpcData.result);
    const usdc = (Number(raw) / 1e6).toFixed(6);
    return NextResponse.json({ usdc, address, network: 'arc-testnet', demo: false });
  } catch {
    return NextResponse.json({ usdc: '0.000000', address, network: 'arc-testnet', demo: false });
  }
}
