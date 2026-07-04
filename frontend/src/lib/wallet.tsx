'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

// ── Arc Testnet constants ─────────────────────────────────────────────────────
const ARC_CHAIN_ID    = '0x4CEF52';           // 5042002 decimal
const ARC_RPC_URL     = 'https://testnet.arcscan.app/api/eth-rpc';
const ARC_EXPLORER    = 'https://testnet.arcscan.app';

const USDC_CONTRACT   = '0x3600000000000000000000000000000000000000';
const USDC_DECIMALS   = 6;
const PLATFORM_WALLET = '0x893f3990a22dfe234893d46a876375191f51d3c4';
const ERC20_TRANSFER_SELECTOR = 'a9059cbb'; // transfer(address,uint256)
const TRANSFER_GAS    = '0x186A0'; // 100 000 — safe for ERC-20 transfer on Arc

// ── Types ─────────────────────────────────────────────────────────────────────
interface WalletState {
  address: string | null;
  balance: string | null;          // USDC balance (real on-chain, 4dp string)
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendPayment: (amountUsdc: string, description: string) => Promise<string>; // returns tx hash
  refreshBalance: () => Promise<void>;
}

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: <T = unknown>(args: { method: string; params?: unknown[] }) => Promise<T>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Direct JSON-RPC call to Blockscout — bypasses MetaMask's configured RPC so balance
// and receipt reads are always correct regardless of what chain MetaMask is on.
async function arcRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(ARC_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json() as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`Arc RPC: ${json.error.message}`);
  return json.result as T;
}

// Read real on-chain USDC balance for `addr` via direct Blockscout RPC.
async function readUsdcBalance(addr: string): Promise<string> {
  const padded = addr.slice(2).padStart(64, '0');
  const data = '0x70a08231' + padded; // balanceOf(address)
  const raw = await arcRpc<string>('eth_call', [{ to: USDC_CONTRACT, data }, 'latest']);
  if (!raw || raw === '0x') return '0.0000';
  return (Number(BigInt(raw)) / 1e6).toFixed(4);
}

// Poll for a transaction receipt via direct Blockscout RPC (not MetaMask's configured RPC).
async function waitForReceipt(txHash: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const receipt = await arcRpc<{ status: string } | null>('eth_getTransactionReceipt', [txHash]);
    if (receipt !== null) {
      if (receipt.status !== '0x1') throw new Error('USDC transfer reverted on-chain');
      return;
    }
  }
  throw new Error('Transaction not confirmed after 2 minutes — check Arc Testnet explorer');
}

// Encode an ERC-20 transfer(to, value) calldata.
function encodeTransfer(to: string, amountUsdc: string): string {
  const rawAmount = BigInt(Math.round(parseFloat(amountUsdc) * Math.pow(10, USDC_DECIMALS)));
  const paddedTo  = to.slice(2).padStart(64, '0');
  const paddedAmt = rawAmount.toString(16).padStart(64, '0');
  return '0x' + ERC20_TRANSFER_SELECTOR + paddedTo + paddedAmt;
}

// ── Context ───────────────────────────────────────────────────────────────────

const WalletCtx = createContext<WalletState>({
  address: null, balance: null, connecting: false,
  connect: async () => {},
  disconnect: () => {},
  sendPayment: async () => { throw new Error('Wallet not connected'); },
  refreshBalance: async () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress]     = useState<string | null>(null);
  const [balance, setBalance]     = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const refreshBalance = useCallback(async (addr?: string) => {
    const a = addr ?? address;
    if (!a || typeof window === 'undefined' || !window.ethereum) return;
    try {
      const bal = await readUsdcBalance(a);
      setBalance(bal);
    } catch {
      setBalance('0.0000');
    }
  }, [address]);

  const connect = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('MetaMask not detected. Install MetaMask to connect a wallet to Arc Testnet.');
      return;
    }
    setConnecting(true);
    try {
      const accounts = await window.ethereum.request<string[]>({ method: 'eth_requestAccounts' });
      const addr = accounts?.[0];
      if (!addr) return;
      setAddress(addr);

      // Switch to (or add) Arc Testnet
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ARC_CHAIN_ID }],
        });
      } catch (err: unknown) {
        if ((err as { code?: number })?.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: ARC_CHAIN_ID,
              chainName: 'Arc Testnet',
              rpcUrls: [ARC_RPC_URL],
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: [ARC_EXPLORER],
            }],
          });
        }
      }

      // Read real on-chain USDC balance
      try {
        const bal = await readUsdcBalance(addr);
        setBalance(bal);
      } catch {
        setBalance('0.0000');
      }
    } catch {
      // User rejected
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setBalance(null);
  }, []);

  // Real on-chain ERC-20 transfer from buyer → platform wallet.
  // Returns the confirmed tx hash. Throws if the user rejects or the tx reverts.
  const sendPayment = useCallback(async (amountUsdc: string, _description: string): Promise<string> => {
    if (!address || typeof window === 'undefined' || !window.ethereum) {
      throw new Error('Wallet not connected');
    }

    const data = encodeTransfer(PLATFORM_WALLET, amountUsdc);

    const txHash = await window.ethereum.request<string>({
      method: 'eth_sendTransaction',
      params: [{
        from: address,
        to: USDC_CONTRACT,
        data,
        gas: TRANSFER_GAS,
      }],
    });

    if (!txHash) throw new Error('No tx hash returned from MetaMask');

    // Wait for on-chain confirmation before returning
    await waitForReceipt(txHash);

    // Refresh displayed balance immediately after confirmation
    try { await refreshBalance(address); } catch { /* non-critical */ }

    return txHash;
  }, [address, refreshBalance]);

  // Sync balance & address when MetaMask account changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    const handler = async (accounts: unknown) => {
      const list = accounts as string[];
      if (!list?.length) {
        setAddress(null); setBalance(null);
      } else {
        setAddress(list[0]);
        try { setBalance(await readUsdcBalance(list[0])); } catch { setBalance('0.0000'); }
      }
    };
    window.ethereum.on('accountsChanged', handler);
    return () => window.ethereum?.removeListener('accountsChanged', handler);
  }, []);

  return (
    <WalletCtx.Provider value={{ address, balance, connecting, connect, disconnect, sendPayment, refreshBalance }}>
      {children}
    </WalletCtx.Provider>
  );
}

export function useWallet() {
  return useContext(WalletCtx);
}
