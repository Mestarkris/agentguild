'use client';

import {
  createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// ── Arc Testnet constants ─────────────────────────────────────────────────────
const ARC_CHAIN_ID    = '0x4CEF52';           // 5042002 decimal
const ARC_RPC_URL     = 'https://testnet.arcscan.app/api/eth-rpc';
const ARC_EXPLORER    = 'https://testnet.arcscan.app';
const USDC_CONTRACT   = '0x3600000000000000000000000000000000000000';
const USDC_DECIMALS   = 6;
const PLATFORM_WALLET = '0x893f3990a22dfe234893d46a876375191f51d3c4';
const ERC20_TRANSFER_SELECTOR = 'a9059cbb';
const TRANSFER_GAS    = '0x186A0';

// ── Provider types ────────────────────────────────────────────────────────────
interface RawProvider {
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  isFrame?: boolean;
  isTrust?: boolean;
  request: <T = unknown>(args: { method: string; params?: unknown[] }) => Promise<T>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
  providers?: RawProvider[];
}

export interface DetectedProvider {
  id: string;
  name: string;
  icon: string;
  raw: RawProvider;
}

declare global {
  interface Window { ethereum?: RawProvider; }
}

// ── Connect step state machine ────────────────────────────────────────────────
type Step =
  | { kind: 'idle' }
  | { kind: 'picking';   list: DetectedProvider[] }
  | { kind: 'connecting'; p: DetectedProvider }
  | { kind: 'switching';  p: DetectedProvider; adding: boolean }
  | { kind: 'conn-rejected' }
  | { kind: 'net-rejected'; p: DetectedProvider };

// ── Wallet context ────────────────────────────────────────────────────────────
interface WalletState {
  address:      string | null;
  balance:      string | null;
  connecting:   boolean;
  connect:      () => void;
  disconnect:   () => void;
  sendPayment:  (amountUsdc: string, description: string) => Promise<string>;
  refreshBalance: () => Promise<void>;
}

const WalletCtx = createContext<WalletState>({
  address: null, balance: null, connecting: false,
  connect: () => {},
  disconnect: () => {},
  sendPayment: async () => { throw new Error('Wallet not connected'); },
  refreshBalance: async () => {},
});

// ── Provider detection ────────────────────────────────────────────────────────
function providerMeta(p: RawProvider): { id: string; name: string; icon: string } {
  // isRabby must come before isMetaMask — Rabby sets both flags for compat
  if (p.isRabby)          return { id: 'rabby',    name: 'Rabby',           icon: '🐰' };
  if (p.isCoinbaseWallet) return { id: 'coinbase', name: 'Coinbase Wallet',  icon: '🔵' };
  if (p.isBraveWallet)    return { id: 'brave',    name: 'Brave Wallet',     icon: '🦁' };
  if (p.isFrame)          return { id: 'frame',    name: 'Frame',            icon: '🖼️' };
  if (p.isTrust)          return { id: 'trust',    name: 'Trust Wallet',     icon: '🔷' };
  if (p.isMetaMask)       return { id: 'metamask', name: 'MetaMask',         icon: '🦊' };
  return                         { id: 'injected', name: 'Browser Wallet',   icon: '🔐' };
}

function detectProviders(): DetectedProvider[] {
  if (typeof window === 'undefined' || !window.ethereum) return [];
  const eth = window.ethereum;
  // EIP-5749: multi-provider array present when several extensions coexist
  const raw: RawProvider[] = eth.providers?.length ? eth.providers : [eth];
  const seen = new Set<string>();
  const out: DetectedProvider[] = [];
  for (const p of raw) {
    const meta = providerMeta(p);
    if (!seen.has(meta.id)) { seen.add(meta.id); out.push({ ...meta, raw: p }); }
  }
  return out;
}

// ── Chain helpers (direct Blockscout — not MetaMask's configured RPC) ─────────
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

async function readUsdcBalance(addr: string): Promise<string> {
  const padded = addr.slice(2).padStart(64, '0');
  const raw = await arcRpc<string>('eth_call', [
    { to: USDC_CONTRACT, data: '0x70a08231' + padded }, 'latest',
  ]);
  if (!raw || raw === '0x') return '0.0000';
  return (Number(BigInt(raw)) / 1e6).toFixed(4);
}

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

function encodeTransfer(to: string, amountUsdc: string): string {
  const raw = BigInt(Math.round(parseFloat(amountUsdc) * Math.pow(10, USDC_DECIMALS)));
  return '0x' + ERC20_TRANSFER_SELECTOR
    + to.slice(2).padStart(64, '0')
    + raw.toString(16).padStart(64, '0');
}

const ARC_CHAIN_PARAMS = {
  chainId: ARC_CHAIN_ID,
  chainName: 'Arc Testnet',
  rpcUrls: [ARC_RPC_URL],
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: [ARC_EXPLORER],
};

// ── WalletProvider ────────────────────────────────────────────────────────────
export function WalletProvider({ children }: { children: ReactNode }) {
  const [address,        setAddress]        = useState<string | null>(null);
  const [balance,        setBalance]        = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<RawProvider | null>(null);
  const [step,           setStep]           = useState<Step>({ kind: 'idle' });

  const connecting = step.kind === 'connecting' || step.kind === 'switching';

  // ── balance refresh ─────────────────────────────────────────────────────────
  const refreshBalance = useCallback(async (addr?: string) => {
    const a = addr ?? address;
    if (!a) return;
    try { setBalance(await readUsdcBalance(a)); }
    catch { setBalance('0.0000'); }
  }, [address]);

  // ── finalize: called once address + chain are confirmed ────────────────────
  const finalize = useCallback(async (p: DetectedProvider, addr: string) => {
    setActiveProvider(p.raw);
    setAddress(addr);
    setStep({ kind: 'idle' });
    try { setBalance(await readUsdcBalance(addr)); }
    catch { setBalance('0.0000'); }
  }, []);

  // ── network switch / add (shared between initial connect and retry) ─────────
  const doSwitchNetwork = useCallback(async (p: DetectedProvider, addr: string) => {
    setStep({ kind: 'switching', p, adding: false });
    try {
      await p.raw.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_CHAIN_ID }],
      });
      await finalize(p, addr);
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        setStep({ kind: 'switching', p, adding: true });
        try {
          await p.raw.request({ method: 'wallet_addEthereumChain', params: [ARC_CHAIN_PARAMS] });
          await finalize(p, addr);
        } catch {
          setStep({ kind: 'net-rejected', p });
        }
      } else {
        setStep({ kind: 'net-rejected', p });
      }
    }
  }, [finalize]);

  // ── doConnect: request accounts then switch network ─────────────────────────
  const doConnect = useCallback(async (p: DetectedProvider) => {
    setStep({ kind: 'connecting', p });
    try {
      const accounts = await p.raw.request<string[]>({ method: 'eth_requestAccounts' });
      const addr = accounts?.[0];
      if (!addr) { setStep({ kind: 'idle' }); return; }

      const chainId = await p.raw.request<string>({ method: 'eth_chainId' });
      if (chainId?.toLowerCase() === ARC_CHAIN_ID.toLowerCase()) {
        await finalize(p, addr);
      } else {
        await doSwitchNetwork(p, addr);
      }
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4001 || code === -32002) {
        setStep({ kind: 'conn-rejected' });
        setTimeout(() => setStep({ kind: 'idle' }), 2200);
      } else {
        setStep({ kind: 'idle' });
      }
    }
  }, [finalize, doSwitchNetwork]);

  // ── public: connect ─────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('No wallet extension found. Install MetaMask or any EIP-1193 wallet.');
      return;
    }
    const list = detectProviders();
    if (list.length === 0) {
      alert('No wallet extension found.');
      return;
    }
    if (list.length === 1) {
      void doConnect(list[0]);
    } else {
      setStep({ kind: 'picking', list });
    }
  }, [doConnect]);

  // ── public: disconnect ──────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    setAddress(null);
    setBalance(null);
    setActiveProvider(null);
    setStep({ kind: 'idle' });
  }, []);

  // ── public: sendPayment ─────────────────────────────────────────────────────
  const sendPayment = useCallback(async (amountUsdc: string, _desc: string): Promise<string> => {
    if (!address || !activeProvider) throw new Error('Wallet not connected');
    const data = encodeTransfer(PLATFORM_WALLET, amountUsdc);
    const txHash = await activeProvider.request<string>({
      method: 'eth_sendTransaction',
      params: [{ from: address, to: USDC_CONTRACT, data, gas: TRANSFER_GAS }],
    });
    if (!txHash) throw new Error('No tx hash returned from wallet');
    await waitForReceipt(txHash);
    try { await refreshBalance(address); } catch { /* non-critical */ }
    return txHash;
  }, [address, activeProvider, refreshBalance]);

  // ── account-change listener ─────────────────────────────────────────────────
  useEffect(() => {
    if (!activeProvider) return;
    const handler = async (accounts: unknown) => {
      const list = accounts as string[];
      if (!list?.length) { setAddress(null); setBalance(null); setActiveProvider(null); }
      else {
        setAddress(list[0]);
        try { setBalance(await readUsdcBalance(list[0])); } catch { setBalance('0.0000'); }
      }
    };
    activeProvider.on('accountsChanged', handler);
    return () => activeProvider.removeListener('accountsChanged', handler);
  }, [activeProvider]);

  const ctxValue = useMemo(() => ({
    address, balance, connecting, connect, disconnect, sendPayment, refreshBalance,
  }), [address, balance, connecting, connect, disconnect, sendPayment, refreshBalance]);

  // ── retry network from net-rejected state ───────────────────────────────────
  async function retryNetwork() {
    if (step.kind !== 'net-rejected') return;
    const p = step.p;
    const accounts = await p.raw.request<string[]>({ method: 'eth_requestAccounts' }).catch(() => null);
    const addr = accounts?.[0];
    if (!addr) return;
    await doSwitchNetwork(p, addr);
  }

  return (
    <WalletCtx.Provider value={ctxValue}>
      {children}

      {/* ── Connect modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {step.kind !== 'idle' && (
          <motion.div
            key="wallet-modal-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
            onClick={() => {
              if (step.kind === 'picking' || step.kind === 'conn-rejected' || step.kind === 'net-rejected') {
                setStep({ kind: 'idle' });
              }
            }}
          >
            <motion.div
              key="wallet-modal-card"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.15 }}
              className="bg-[#0d0d14] border border-[rgba(239,159,39,0.2)] rounded-2xl p-6 w-full max-w-sm shadow-2xl"
              onClick={e => e.stopPropagation()}
            >

              {/* Step: provider picker */}
              {step.kind === 'picking' && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-white font-bold text-base">Connect Wallet</h2>
                      <p className="text-[#6b6b78] text-xs mt-0.5">Choose a wallet to connect</p>
                    </div>
                    <button
                      onClick={() => setStep({ kind: 'idle' })}
                      className="text-[#4a4a55] hover:text-white transition-colors text-lg leading-none"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="space-y-2">
                    {step.list.map(p => (
                      <button
                        key={p.id}
                        onClick={() => void doConnect(p)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[rgba(239,159,39,0.12)] hover:border-[rgba(239,159,39,0.4)] hover:bg-[rgba(239,159,39,0.06)] transition-all text-left group"
                      >
                        <span className="text-2xl shrink-0">{p.icon}</span>
                        <div className="min-w-0">
                          <div className="text-white font-medium text-sm">{p.name}</div>
                          <div className="text-[#4a4a55] text-[10px] font-mono">EIP-1193 Injected</div>
                        </div>
                        <span className="ml-auto text-[#4a4a55] group-hover:text-[#ef9f27] transition-colors shrink-0">→</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Step: waiting for eth_requestAccounts */}
              {step.kind === 'connecting' && (
                <div className="text-center py-3">
                  <div className="w-10 h-10 border-2 border-[rgba(239,159,39,0.2)] border-t-[#ef9f27] rounded-full animate-spin mx-auto mb-4" />
                  <div className="text-3xl mb-2">{step.p.icon}</div>
                  <p className="text-white font-semibold">Connecting to {step.p.name}</p>
                  <p className="text-[#6b6b78] text-xs mt-1.5">
                    Check your wallet extension for a connection prompt…
                  </p>
                </div>
              )}

              {/* Step: waiting for wallet_switchEthereumChain / wallet_addEthereumChain */}
              {step.kind === 'switching' && (
                <div className="text-center py-3">
                  <div className="w-10 h-10 border-2 border-[rgba(239,159,39,0.2)] border-t-[#ef9f27] rounded-full animate-spin mx-auto mb-4" />
                  <div className="text-2xl mb-2">🌐</div>
                  <p className="text-white font-semibold">
                    {step.adding ? 'Add Arc Testnet' : 'Switch to Arc Testnet'}
                  </p>
                  <p className="text-[#6b6b78] text-xs mt-1.5 leading-relaxed">
                    {step.adding
                      ? `Approve adding Arc Testnet in ${step.p.name} to continue`
                      : `Approve the network switch in ${step.p.name} to continue`}
                  </p>
                  <div className="mt-4 rounded-xl bg-[#050508] border border-[rgba(239,159,39,0.1)] px-4 py-3 text-left">
                    <div className="space-y-1 text-[11px] font-mono">
                      <div className="flex justify-between">
                        <span className="text-[#4a4a55]">Network</span>
                        <span className="text-white">Arc Testnet</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#4a4a55]">Chain ID</span>
                        <span className="text-white">5042002</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#4a4a55]">Currency</span>
                        <span className="text-white">ETH</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-[#4a4a55] shrink-0">RPC</span>
                        <span className="text-white text-right break-all">testnet.arcscan.app</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step: user rejected wallet connection */}
              {step.kind === 'conn-rejected' && (
                <div className="text-center py-3">
                  <div className="text-3xl mb-3">✕</div>
                  <p className="text-white font-semibold">Connection cancelled</p>
                  <p className="text-[#6b6b78] text-xs mt-1.5">You declined the wallet request.</p>
                </div>
              )}

              {/* Step: user rejected network switch */}
              {step.kind === 'net-rejected' && (
                <div className="text-center py-3">
                  <div className="text-3xl mb-3">🌐</div>
                  <p className="text-white font-semibold">Arc Testnet required</p>
                  <p className="text-[#6b6b78] text-xs mt-2 leading-relaxed">
                    AgentGuild runs on Arc Testnet (chain 5042002).
                    Please approve the network in {step.p.name} to continue.
                  </p>
                  <button
                    onClick={() => void retryNetwork()}
                    className="mt-4 w-full py-2.5 rounded-xl border border-[rgba(239,159,39,0.5)] text-[#ef9f27] text-sm font-mono hover:bg-[rgba(239,159,39,0.1)] transition-colors"
                  >
                    Add / Switch Arc Testnet →
                  </button>
                  <button
                    onClick={() => setStep({ kind: 'idle' })}
                    className="mt-2 w-full py-1.5 text-xs text-[#4a4a55] hover:text-[#6b6b78] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </WalletCtx.Provider>
  );
}

export function useWallet() {
  return useContext(WalletCtx);
}
