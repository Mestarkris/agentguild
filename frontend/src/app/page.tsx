'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getMetrics, submitJob } from '@/lib/api';
import type { Metrics, Job } from '@/lib/types';
import { useWallet } from '@/lib/wallet';
import NetworkGraph from '@/components/NetworkGraph';
import TickerStrip from '@/components/TickerStrip';
import type { TickerItem } from '@/components/TickerStrip';

const EXAMPLES = [
  'Research the latest AI agent payment protocols, summarize the key findings, then translate the summary to Spanish',
  'Review this Python code for bugs: def fib(n): return n if n<2 else fib(n-1)+fib(n-2) — then fact-check that Fibonacci is O(2^n)',
  'Write a SQL query to rank agents by USDC earned, then generate a bar chart spec for the results',
  'Analyze sentiment of these product reviews, then generate a financial KPI report from the results',
  'Research the history of stablecoins, extract key entities and dates, then summarize the timeline',
];

function truncAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

function statusDot(status: string): string {
  const colors: Record<string, string> = {
    completed: '#22c55e',
    settled:   '#22c55e',
    running:   '#ef9f27',
    planning:  '#60a5fa',
    settling:  '#facc15',
    failed:    '#ef4444',
    pending:   '#9ca3af',
  };
  return colors[status] ?? '#9ca3af';
}

export default function Home() {
  const { address, balance, connect, connecting, sendPayment } = useWallet();
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [buyerTxHash, setBuyerTxHash] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const submittingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const m = await getMetrics();
      setMetrics(m);
      setRecentJobs(m.recent_jobs ?? []);
    } catch { /* orchestrator offline */ }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => { setApproved(false); setApproving(false); setBuyerTxHash(null); }, [description]);

  const estimatedCost = description.trim()
    ? Math.max(0.0015, description.split(/\s+/).filter(Boolean).length * 0.00015).toFixed(4)
    : '0.0020';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { console.warn('[Submit] blocked: empty description'); return; }
    if (!address) { console.warn('[Submit] blocked: no wallet connected'); return; }
    if (submittingRef.current) { console.warn('[Submit] blocked: already in flight'); return; }
    submittingRef.current = true;

    console.log('[Submit] Starting — wallet:', address, 'description length:', description.trim().length);
    setSubmitting(true);
    setError('');

    try {
      console.log('[Submit] Calling POST /api/jobs...');
      const { jobId } = await submitJob(description, address, buyerTxHash ?? undefined);
      console.log('[Submit] Job created:', jobId);

      if (!jobId) {
        throw new Error('Server returned empty jobId — check /api/jobs logs');
      }

      const target = `/jobs/${jobId}`;
      console.log('[Submit] Navigating to', target);
      router.push(target);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err as Error)?.message
        ?? 'Failed to submit. Check the browser console for details.';
      console.error('[Submit] Error:', err);
      setError(msg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const tickerItems: TickerItem[] = metrics
    ? [
        { label: 'USDC SETTLED', value: `$${metrics.totals.usdc_settled.toFixed(4)}` },
        { label: 'JOBS COMPLETE', value: String(metrics.totals.jobs_completed) },
        { label: 'AGENTS ONLINE', value: String(metrics.totals.agents_registered) },
        { label: 'AVG SETTLEMENT', value: `${metrics.totals.avg_settlement_secs.toFixed(1)}s` },
        { label: 'CHAIN', value: 'ARC TESTNET' },
        { label: 'PROTOCOL', value: 'x402' },
        { label: 'SETTLEMENT', value: 'USDC' },
      ]
    : [
        { label: 'NETWORK', value: 'LIVE' },
        { label: 'CHAIN', value: 'ARC TESTNET' },
        { label: 'PROTOCOL', value: 'x402' },
        { label: 'SETTLEMENT', value: 'USDC' },
        { label: 'AGENTS', value: '12 REGISTERED' },
      ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="grid-bg pt-14 pb-8 px-6 overflow-hidden">
        <div className="max-w-3xl mx-auto text-center mb-6">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-3">
            Agent<span className="text-[var(--accent)]">Guild</span>
          </h1>
          <p className="text-[var(--text-3)] text-base max-w-md mx-auto">
            The trading floor for AI agents. Submit a job — the Planner decomposes it, routes to specialists, splits payment on Arc.
          </p>
        </div>
        <NetworkGraph />
      </section>

      {/* Live ticker */}
      <TickerStrip items={tickerItems} />

      {/* Submit */}
      <section className="max-w-2xl mx-auto px-6 py-10">
        <h2 className="text-sm font-mono text-[var(--text-4)] uppercase tracking-widest mb-5">Submit a Job</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe what you need done — the Planner will break it into steps and assign agents..."
            rows={4}
            className="w-full bg-[var(--surface)] border border-[var(--border-accent-dim)] rounded-xl px-4 py-3 text-sm text-[var(--text-1)] placeholder-[var(--text-5)] focus:outline-none focus:border-[var(--border-accent-mid)] resize-none transition-colors shadow-sm"
          />

          {/* Example prompts */}
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDescription(ex)}
                className="text-xs px-2 py-1 rounded-md bg-[var(--surface)] border border-[var(--border-accent-dim)] text-[var(--text-4)] hover:text-[var(--text-2)] hover:border-[var(--border-accent-mid)] transition-all text-left"
              >
                {ex.length > 52 ? ex.slice(0, 52) + '…' : ex}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-red-500 dark:text-red-400 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Wallet gate */}
          {!address ? (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-accent-dim)] bg-[var(--surface)] shadow-sm">
              <div className="flex-1">
                <p className="text-sm text-[var(--text-2)]">Connect a wallet to submit a job</p>
                <p className="text-xs text-[var(--text-4)] mt-0.5">Arc Testnet · USDC payment required</p>
              </div>
              <button
                type="button"
                onClick={connect}
                disabled={connecting}
                className="px-4 py-2 rounded-lg border border-[var(--border-accent-mid)] text-[var(--accent)] text-sm hover:bg-[var(--hover-accent-bg)] disabled:opacity-50 transition-colors"
              >
                {connecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Connected wallet row */}
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border-accent-dim)] shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                  <span className="text-xs font-mono text-[var(--accent)]">{truncAddr(address)}</span>
                </div>
                {balance && (
                  <span className="text-xs font-mono text-[var(--text-2)]">
                    <span className="text-[var(--accent)]">{balance}</span> USDC available
                  </span>
                )}
              </div>

              {/* Cost estimate */}
              {description.trim() && (
                <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-[var(--tint-accent)] border border-[var(--border-accent-dim)]">
                  <span className="text-xs text-[var(--text-3)]">Estimated cost</span>
                  <span className="text-xs font-mono text-[var(--accent)]">${estimatedCost} USDC → escrow</span>
                </div>
              )}

              {/* Submit / approve */}
              {!approved ? (
                <button
                  type="button"
                  disabled={!description.trim() || approving}
                  onClick={async () => {
                    setApproving(true);
                    setError('');
                    try {
                      const txHash = await sendPayment(estimatedCost, description);
                      setBuyerTxHash(txHash);
                      setApproved(true);
                    } catch (err: unknown) {
                      const msg = (err as Error)?.message ?? 'Payment failed';
                      if (!msg.toLowerCase().includes('user rejected') && !msg.toLowerCase().includes('user denied')) {
                        setError(msg);
                      }
                    } finally {
                      setApproving(false);
                    }
                  }}
                  className="w-full py-3 rounded-xl font-mono text-sm border border-[var(--border-accent-mid)] text-[var(--accent)] hover:bg-[var(--hover-accent-bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {approving ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-[var(--border-accent-dim)] border-t-[var(--accent)] rounded-full animate-spin" />
                      Sending USDC · waiting for confirmation…
                    </span>
                  ) : description.trim() ? `Send $${estimatedCost} USDC & Run →` : 'Enter a job description'}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl font-mono text-sm bg-[#ef9f27] text-black font-bold hover:bg-[#d68f22] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Routing to agents…
                    </span>
                  ) : (
                    `Confirm · $${estimatedCost} USDC`
                  )}
                </button>
              )}
            </div>
          )}
        </form>
      </section>

      {/* Recent jobs */}
      {recentJobs.length > 0 && (
        <section className="max-w-2xl mx-auto px-6 pb-16">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-mono text-[var(--text-4)] uppercase tracking-widest">Recent Jobs</h2>
            <Link href="/jobs" className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors font-mono">
              view all →
            </Link>
          </div>
          <div className="rounded-xl border border-[var(--border-accent-dim)] overflow-hidden shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-4)]">
                  <th className="text-left font-mono font-normal px-4 py-2 w-20">ID</th>
                  <th className="text-left font-normal px-2 py-2">Description</th>
                  <th className="text-center font-normal px-2 py-2 w-6">St</th>
                  <th className="text-right font-mono font-normal px-4 py-2 w-24">USDC</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job, i) => (
                  <tr
                    key={job.id}
                    className={`border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--tint-accent)] transition-colors ${i % 2 === 0 ? 'bg-[var(--bg)]' : 'bg-[var(--bg-alt)]'}`}
                  >
                    <td className="px-4 py-2.5">
                      <Link href={`/jobs/${job.id}`} className="font-mono text-[var(--text-4)] hover:text-[var(--accent)] transition-colors">
                        {job.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 max-w-0">
                      <Link href={`/jobs/${job.id}`} className="text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors truncate block">
                        {job.description}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ background: statusDot(job.status) }}
                        title={job.status}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {job.total_price_usdc != null
                        ? <span className="text-[var(--accent)]">${job.total_price_usdc.toFixed(4)}</span>
                        : <span className="text-[var(--text-5)]">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!metrics && (
        <p className="max-w-2xl mx-auto px-6 pb-16 text-xs font-mono text-[var(--text-6)] text-center">
          orchestrator offline — run: cd orchestrator && npm start
        </p>
      )}
    </div>
  );
}
