'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

interface WalletState {
  address: string | null;
  balance: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signPaymentAuth: (amount: string, description: string) => Promise<boolean>;
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

const WalletCtx = createContext<WalletState>({
  address: null,
  balance: null,
  connecting: false,
  connect: async () => {},
  disconnect: () => {},
  signPaymentAuth: async () => false,
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const fetchBalance = useCallback(async (addr: string) => {
    try {
      const res = await fetch(`/api/wallet/balance?address=${addr}`);
      const data = await res.json() as { usdc?: string };
      setBalance(data.usdc ?? '0.0000');
    } catch {
      setBalance('0.0000');
    }
  }, []);

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
      await fetchBalance(addr);

      // Add Arc Testnet to MetaMask
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x457' }] });
      } catch (err: unknown) {
        if ((err as { code?: number })?.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x457',
              chainName: 'Arc Testnet',
              rpcUrls: ['https://arc-node.thecanteenapp.com'],
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://arc-explorer.thecanteenapp.com'],
            }],
          });
        }
      }
    } catch {
      // User rejected
    } finally {
      setConnecting(false);
    }
  }, [fetchBalance]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setBalance(null);
  }, []);

  const signPaymentAuth = useCallback(async (amount: string, description: string): Promise<boolean> => {
    if (!address || typeof window === 'undefined' || !window.ethereum) return false;
    const snippet = description.length > 80 ? description.slice(0, 80) + '…' : description;
    const message = [
      'AgentGuild — Payment Authorization',
      '',
      `Amount: $${amount} USDC`,
      `Network: Arc Testnet (Chain 1111)`,
      `Job: "${snippet}"`,
      `Issued: ${new Date().toISOString()}`,
      '',
      'By signing you authorize AgentGuild to hold this amount in escrow.',
      'Funds are released to agents only after work is verified complete.',
    ].join('\n');
    const msgHex = '0x' + Array.from(new TextEncoder().encode(message))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    try {
      await window.ethereum.request({ method: 'personal_sign', params: [msgHex, address] });
      return true;
    } catch {
      return false;
    }
  }, [address]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    const handler = (accounts: unknown) => {
      const list = accounts as string[];
      if (!list?.length) { setAddress(null); setBalance(null); }
      else { setAddress(list[0]); fetchBalance(list[0]); }
    };
    window.ethereum.on('accountsChanged', handler);
    return () => window.ethereum?.removeListener('accountsChanged', handler);
  }, [fetchBalance]);

  return (
    <WalletCtx.Provider value={{ address, balance, connecting, connect, disconnect, signPaymentAuth }}>
      {children}
    </WalletCtx.Provider>
  );
}

export function useWallet() {
  return useContext(WalletCtx);
}
