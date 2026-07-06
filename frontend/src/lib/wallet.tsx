'use client';

import {
  createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// ── Arc Testnet constants ─────────────────────────────────────────────────────
const ARC_CHAIN_ID    = '0x4cef52';           // 5042002 decimal — lowercase matches eth_chainId response
const ARC_RPC_URL     = 'https://testnet.arcscan.app/api/eth-rpc';
const ARC_EXPLORER    = 'https://testnet.arcscan.app';
const USDC_CONTRACT   = '0x3600000000000000000000000000000000000000';
const USDC_DECIMALS   = 6;
const PLATFORM_WALLET = '0x893f3990a22dfe234893d46a876375191f51d3c4';
const ERC20_TRANSFER_SELECTOR = 'a9059cbb';
const TRANSFER_GAS    = '0x186A0';

const ARC_CHAIN_PARAMS = {
  chainId: ARC_CHAIN_ID,
  chainName: 'Arc Testnet',
  rpcUrls: [ARC_RPC_URL],
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: [ARC_EXPLORER],
};

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

// ── Step 1 state: wallet selection + eth_requestAccounts ──────────────────────
// Step 2 state: chain check + wallet_switchEthereumChain / wallet_addEthereumChain
//
// The two steps are kept strictly separate: step 1 finishes (address in nav,
// connecting modal closed) BEFORE step 2 starts (network modal opens).
type Step =
  // step 1
  | { kind: 'idle' }
  | { kind: 'picking';        list: DetectedProvider[] }
  | { kind: 'connecting';     p: DetectedProvider }
  | { kind: 'conn-failed';    message: string }        // auto-dismisses
  // step 2 (only after address is set)
  | { kind: 'need-network';   p: DetectedProvider; addr: string }
  | { kind: 'switching';      p: DetectedProvider; addr: string; adding: boolean }
  | { kind: 'net-failed';     p: DetectedProvider; addr: string; message: string };

// ── Wallet context ────────────────────────────────────────────────────────────
interface WalletState {
  address:        string | null;
  balance:        string | null;
  connecting:     boolean;
  connect:        () => void;
  disconnect:     () => void;
  sendPayment:    (amountUsdc: string, description: string) => Promise<string>;
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
  // isRabby must precede isMetaMask: Rabby sets isMetaMask=true for compat
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
  const raw = eth.providers?.length ? eth.providers : [eth];
  const seen = new Set<string>();
  const out: DetectedProvider[] = [];
  for (const p of raw) {
    const meta = providerMeta(p);
    if (!seen.has(meta.id)) { seen.add(meta.id); out.push({ ...meta, raw: p }); }
  }
  return out;
}

// ── Chain helpers ─────────────────────────────────────────────────────────────
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

// ── WalletProvider ────────────────────────────────────────────────────────────
export function WalletProvider({ children }: { children: ReactNode }) {
  const [address,        setAddress]        = useState<string | null>(null);
  const [balance,        setBalance]        = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<RawProvider | null>(null);
  const [step,           setStep]           = useState<Step>({ kind: 'idle' });

  // connecting = true only during actual wallet-blocking waits (spinner states)
  const connecting = step.kind === 'connecting' || step.kind === 'switching';

  // ── helpers ─────────────────────────────────────────────────────────────────
  const refreshBalance = useCallback(async (addr?: string) => {
    const a = addr ?? address;
    if (!a) return;
    try { setBalance(await readUsdcBalance(a)); }
    catch { setBalance('0.0000'); }
  }, [address]);

  function showConnFailed(message: string) {
    setStep({ kind: 'conn-failed', message });
    setTimeout(() => setStep({ kind: 'idle' }), 2500);
  }

  // ── STEP 1: request accounts from the chosen provider ───────────────────────
  // Completes fully (address in nav, modal closed) before step 2 starts.
  async function doConnect(p: DetectedProvider) {
    setStep({ kind: 'connecting', p });
    let addr: string;
    try {
      const accounts = await p.raw.request<string[]>({ method: 'eth_requestAccounts' });
      addr = accounts?.[0] ?? '';
      if (!addr) { setStep({ kind: 'idle' }); return; }
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4001) {
        showConnFailed('Connection cancelled — you declined the request.');
      } else if (code === -32002) {
        showConnFailed('A connection request is already pending — check your wallet.');
      } else {
        showConnFailed((err as Error)?.message ?? 'Connection failed.');
      }
      return;
    }

    // ── Step 1 is done. Set address immediately so nav updates. ────────────────
    setAddress(addr);
    setActiveProvider(p.raw);
    setStep({ kind: 'idle' });                         // connecting modal closes here
    readUsdcBalance(addr).then(setBalance).catch(() => setBalance('0.0000'));

    // ── Step 2: check chain ID (fast async, no loading state needed) ───────────
    // If already on Arc, nothing more to do. If not, show the network modal.
    try {
      const chainId = await p.raw.request<string>({ method: 'eth_chainId' });
      if (chainId?.toLowerCase() !== ARC_CHAIN_ID.toLowerCase()) {
        setStep({ kind: 'need-network', p, addr });    // network modal opens here
      }
      // else: already on Arc — fully done, no further modal
    } catch {
      // chain-ID check failed — silently ignore, user can dismiss manually if needed
    }

    // Register Arc USDC with MetaMask so it shows "0.0025 USDC" instead of
    // the raw uint256 integer ("-2500 unknown token") in transaction prompts.
    // wallet_watchAsset is fire-and-forget — failure is non-critical.
    p.raw.request({
      method: 'wallet_watchAsset',
      params: [{
        type: 'ERC20',
        options: {
          address: USDC_CONTRACT,
          symbol:  'USDC',
          decimals: USDC_DECIMALS,
          image: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
        },
      }],
    }).catch(() => { /* non-critical */ });
  }

  // ── STEP 2: switch / add Arc Testnet ────────────────────────────────────────
  // Triggered only when the user explicitly clicks "Add / Switch Arc Testnet".
  //
  // EIP-3085 flow:
  //   1. wallet_switchEthereumChain — works if Arc is already in the wallet.
  //   2. 4902 (chain not recognized) → wallet_addEthereumChain with full params.
  //      After wallet_addEthereumChain succeeds the chain is added AND active — no
  //      second switch call needed.
  //   3. 4001 on switch = user rejected switch (different from "chain not found").
  //   4. 4001 on add   = user rejected the add popup.
  //   Other errors fall through to the generic message.
  async function doSwitchNetwork(p: DetectedProvider, addr: string) {
    // Normalize a wallet error's code field to a number regardless of whether
    // the wallet emits it as a number (standard) or a string (some builds do).
    function errCode(e: unknown): number | undefined {
      const raw = (e as { code?: unknown })?.code;
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'string') { const n = parseInt(raw, 10); return isNaN(n) ? undefined : n; }
      return undefined;
    }

    setStep({ kind: 'switching', p, addr, adding: false });
    try {
      await p.raw.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_CHAIN_ID }],
      });
      setStep({ kind: 'idle' });                       // already on Arc — done
    } catch (err: unknown) {
      const code = errCode(err);
      if (code === 4902) {
        // Chain not yet in wallet — add it.
        // wallet_addEthereumChain both adds the chain AND switches to it in one call.
        setStep({ kind: 'switching', p, addr, adding: true });
        try {
          await p.raw.request({ method: 'wallet_addEthereumChain', params: [ARC_CHAIN_PARAMS] });
          setStep({ kind: 'idle' });
        } catch (addErr: unknown) {
          const addCode = errCode(addErr);
          const msg = addCode === 4001
            ? 'You declined adding Arc Testnet — please approve to continue.'
            : ((addErr as Error)?.message ?? 'Could not add Arc Testnet.');
          setStep({ kind: 'net-failed', p, addr, message: msg });
        }
      } else if (code === 4001) {
        setStep({
          kind: 'net-failed', p, addr,
          message: 'You declined the network switch — approve Arc Testnet to continue.',
        });
      } else {
        setStep({
          kind: 'net-failed', p, addr,
          message: (err as Error)?.message ?? 'Network switch failed.',
        });
      }
    }
  }

  // ── public: connect ─────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('No wallet extension found. Install MetaMask, Rabby, or any EIP-1193 wallet.');
      return;
    }
    const list = detectProviders();
    if (list.length === 0) { alert('No wallet extension found.'); return; }
    if (list.length === 1) { void doConnect(list[0]); }
    else                   { setStep({ kind: 'picking', list }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Pre-flight in parallel: chainId (wallet cache), nonce + gasPrice (Arc RPC direct).
    // Providing these to eth_sendTransaction means the wallet skips its own sequential
    // RPC round-trips before showing the popup — that's the main source of popup latency.
    // Gas is already hardcoded (TRANSFER_GAS = 100k) so eth_estimateGas is not needed.
    const [chainId, nonce, gasPrice] = await Promise.all([
      activeProvider.request<string>({ method: 'eth_chainId' }),
      arcRpc<string>('eth_getTransactionCount', [address, 'pending']),
      arcRpc<string>('eth_gasPrice', []),
    ]);

    if (chainId?.toLowerCase() !== ARC_CHAIN_ID.toLowerCase()) {
      throw new Error(`Wrong network — please switch to Arc Testnet (chain ${parseInt(ARC_CHAIN_ID, 16)})`);
    }

    const txHash = await activeProvider.request<string>({
      method: 'eth_sendTransaction',
      params: [{ from: address, to: USDC_CONTRACT, data, gas: TRANSFER_GAS, nonce, gasPrice }],
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

  // ── Modal visibility ─────────────────────────────────────────────────────────
  // Backdrop is dismissible only for states where the user hasn't committed yet.
  const modalVisible = step.kind !== 'idle';
  const backdropDismissible =
    step.kind === 'picking' ||
    step.kind === 'conn-failed' ||
    step.kind === 'need-network' ||
    step.kind === 'net-failed';

  return (
    <WalletCtx.Provider value={ctxValue}>
      {children}

      <AnimatePresence>
        {modalVisible && (
          <motion.div
            key="wallet-modal-bg"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
            onClick={() => { if (backdropDismissible) setStep({ kind: 'idle' }); }}
          >
            <motion.div
              key="wallet-modal-card"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.14 }}
              className="bg-[#0d0d14] border border-[rgba(239,159,39,0.2)] rounded-2xl p-6 w-full max-w-sm shadow-2xl"
              onClick={e => e.stopPropagation()}
            >

              {/* ── STEP 1a: wallet picker ──────────────────────────────────── */}
              {step.kind === 'picking' && (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-[10px] font-mono text-[#ef9f27] mb-0.5">STEP 1 OF 2</p>
                      <h2 className="text-white font-bold text-base">Connect Wallet</h2>
                      <p className="text-[#6b6b78] text-xs mt-0.5">Choose a wallet to connect</p>
                    </div>
                    <button onClick={() => setStep({ kind: 'idle' })}
                      className="text-[#4a4a55] hover:text-white transition-colors text-lg leading-none mt-0.5">
                      ✕
                    </button>
                  </div>
                  <div className="space-y-2">
                    {step.list.map(p => (
                      <button key={p.id} onClick={() => void doConnect(p)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[rgba(239,159,39,0.12)] hover:border-[rgba(239,159,39,0.4)] hover:bg-[rgba(239,159,39,0.06)] transition-all text-left group">
                        <span className="text-2xl shrink-0">{p.icon}</span>
                        <div className="min-w-0">
                          <div className="text-white font-medium text-sm">{p.name}</div>
                          <div className="text-[#4a4a55] text-[10px] font-mono">EIP-1193 · Injected</div>
                        </div>
                        <span className="ml-auto text-[#4a4a55] group-hover:text-[#ef9f27] transition-colors shrink-0">→</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ── STEP 1b: waiting for eth_requestAccounts ───────────────── */}
              {step.kind === 'connecting' && (
                <div className="text-center py-3">
                  <div className="w-10 h-10 border-2 border-[rgba(239,159,39,0.2)] border-t-[#ef9f27] rounded-full animate-spin mx-auto mb-4" />
                  <div className="text-3xl mb-2">{step.p.icon}</div>
                  <p className="text-white font-semibold">Connecting to {step.p.name}</p>
                  <p className="text-[#6b6b78] text-xs mt-1.5 leading-relaxed">
                    Check your wallet extension for a connection prompt…
                  </p>
                  <div className="mt-4 text-[10px] font-mono text-[#3a3a44]">
                    STEP 1 OF 2 — wallet connect
                  </div>
                </div>
              )}

              {/* ── STEP 1 failed ──────────────────────────────────────────── */}
              {step.kind === 'conn-failed' && (
                <div className="text-center py-3">
                  <div className="text-3xl mb-3">✕</div>
                  <p className="text-white font-semibold">Connection failed</p>
                  <p className="text-[#6b6b78] text-xs mt-1.5 leading-relaxed">{step.message}</p>
                </div>
              )}

              {/* ── STEP 2a: wrong network detected, awaiting user action ───── */}
              {step.kind === 'need-network' && (
                <div className="text-center py-1">
                  <div className="text-3xl mb-3">🌐</div>
                  <p className="text-[10px] font-mono text-[#ef9f27] mb-1">STEP 2 OF 2</p>
                  <p className="text-white font-semibold">Switch to Arc Testnet</p>
                  <p className="text-[#6b6b78] text-xs mt-2 leading-relaxed">
                    Your wallet is on a different network.
                    AgentGuild runs on Arc Testnet (chain 5042002).
                  </p>
                  <div className="mt-4 rounded-xl bg-[#050508] border border-[rgba(239,159,39,0.1)] px-4 py-3 text-left">
                    <div className="space-y-1.5 text-[11px] font-mono">
                      {[
                        ['Network',  'Arc Testnet'],
                        ['Chain ID', '5042002'],
                        ['Currency', 'ETH'],
                        ['RPC',      'testnet.arcscan.app'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4">
                          <span className="text-[#4a4a55] shrink-0">{k}</span>
                          <span className="text-white text-right break-all">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => void doSwitchNetwork(step.p, step.addr)}
                    className="mt-4 w-full py-2.5 rounded-xl bg-[rgba(239,159,39,0.1)] border border-[rgba(239,159,39,0.5)] text-[#ef9f27] text-sm font-mono hover:bg-[rgba(239,159,39,0.18)] transition-colors"
                  >
                    Add / Switch Arc Testnet →
                  </button>
                  <button onClick={() => setStep({ kind: 'idle' })}
                    className="mt-2 w-full py-1.5 text-xs text-[#4a4a55] hover:text-[#6b6b78] transition-colors">
                    Skip for now
                  </button>
                </div>
              )}

              {/* ── STEP 2b: waiting for wallet_switchEthereumChain ────────── */}
              {step.kind === 'switching' && (
                <div className="text-center py-3">
                  <div className="w-10 h-10 border-2 border-[rgba(239,159,39,0.2)] border-t-[#ef9f27] rounded-full animate-spin mx-auto mb-4" />
                  <div className="text-2xl mb-2">🌐</div>
                  <p className="text-white font-semibold">
                    {step.adding ? 'Adding Arc Testnet…' : 'Switching network…'}
                  </p>
                  <p className="text-[#6b6b78] text-xs mt-1.5 leading-relaxed">
                    {step.adding
                      ? `Approve adding Arc Testnet in ${step.p.name}…`
                      : `Approve the network switch in ${step.p.name}…`}
                  </p>
                  <div className="mt-4 text-[10px] font-mono text-[#3a3a44]">
                    STEP 2 OF 2 — network switch
                  </div>
                </div>
              )}

              {/* ── STEP 2 failed ──────────────────────────────────────────── */}
              {step.kind === 'net-failed' && (
                <div className="text-center py-1">
                  <div className="text-3xl mb-3">🌐</div>
                  <p className="text-[10px] font-mono text-[#ef9f27] mb-1">STEP 2 OF 2</p>
                  <p className="text-white font-semibold">Arc Testnet required</p>
                  <p className="text-[#ef4444] text-xs mt-2 leading-relaxed bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
                    {step.message}
                  </p>
                  <button
                    onClick={() => void doSwitchNetwork(step.p, step.addr)}
                    className="mt-4 w-full py-2.5 rounded-xl border border-[rgba(239,159,39,0.5)] text-[#ef9f27] text-sm font-mono hover:bg-[rgba(239,159,39,0.1)] transition-colors"
                  >
                    Try again →
                  </button>
                  <button onClick={() => setStep({ kind: 'idle' })}
                    className="mt-2 w-full py-1.5 text-xs text-[#4a4a55] hover:text-[#6b6b78] transition-colors">
                    Skip for now
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
