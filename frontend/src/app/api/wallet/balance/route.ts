import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'invalid address' }, { status: 400 });
  }

  // Arc testnet — deterministic demo USDC balance seeded from address
  // In production: call eth_call on the USDC ERC-20 contract
  const seed = parseInt(address.slice(2, 10), 16);
  const usdc = ((seed % 9500) / 100 + 5).toFixed(4);

  return NextResponse.json({ usdc, address, network: 'arc-testnet', demo: true });
}
