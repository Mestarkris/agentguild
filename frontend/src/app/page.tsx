'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { getMetrics, submitJob } from '@/lib/api';
import type { Metrics, Job } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';

const EXAMPLES = [
  'Research the latest AI agent payment protocols, summarize the key findings, then translate the summary to Spanish',
  'Review this Python code for bugs: def fib(n): return n if n<2 else fib(n-1)+fib(n-2) — then fact-check that Fibonacci is O(2^n)',
  'Write a SQL query to rank agents by USDC earned, then generate a bar chart spec for the results',
  'Review this contract clause for legal risks: "Agent bears unlimited liability for output errors" — then fact-check enforceability under US law',
  'Analyze sentiment of these product reviews, then generate a financial KPI report from the results',
  'Research the history of stablecoins, extract key entities and dates, then summarize the timeline',
];

export default function Home() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);

  const refresh = useCallback(async () => {
    try {
      const m = await getMetrics();
      setMetrics(m);
      setRecentJobs(m.recent_jobs ?? []);
    } catch {
      // orchestrator not running
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const { jobId } = await submitJob(description);
      window.location.href = `/jobs/${jobId}`;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to submit. Is the orchestrator running on :4000?');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative grid-bg pt-20 pb-16 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-cyan-500/8 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950" />

        <div className="relative max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Live · Arc Testnet · USDC Nanopayments · x402
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight">
              <span className="bg-gradient-to-r from-cyan-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
                AgentGuild
              </span>
            </h1>
            <p className="text-lg text-slate-400 mb-8 max-w-xl mx-auto leading-relaxed">
              Submit a job. The Planner decomposes it into subtasks, routes each to the best-fit agent,
              and splits payment across every contributor — settled instantly on Arc.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <AnimatePresence>
        {metrics && (
          <motion.section
            key="stats"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-y border-slate-800/60 bg-slate-900/40 backdrop-blur"
          >
            <div className="max-w-4xl mx-auto px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-6">
              <Stat label="USDC Settled" value={`$${metrics.totals.usdc_settled.toFixed(4)}`} color="text-cyan-400" />
              <Stat label="Jobs Completed" value={String(metrics.totals.jobs_completed)} color="text-violet-400" />
              <Stat label="Agents Active" value={String(metrics.totals.agents_registered)} color="text-cyan-400" />
              <Stat label="Avg Settlement" value={`${metrics.totals.avg_settlement_secs.toFixed(1)}s`} color="text-violet-400" />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Submit */}
      <section className="max-w-2xl mx-auto px-6 py-12">
        <h2 className="text-xl font-semibold mb-5 text-slate-200">Submit a Job</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe what you need done — the Planner will break it into steps and assign agents..."
            rows={4}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 resize-none transition-colors"
          />

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDescription(ex)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-all text-left"
              >
                {ex.length > 55 ? ex.slice(0, 55) + '…' : ex}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !description.trim()}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-violet-600 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Routing to agents…
              </span>
            ) : 'Submit Job →'}
          </button>
        </form>
      </section>

      {/* Recent jobs */}
      {recentJobs.length > 0 && (
        <section className="max-w-2xl mx-auto px-6 pb-16">
          <h2 className="text-base font-semibold mb-3 text-slate-400 uppercase tracking-wide text-xs">Recent Jobs</h2>
          <div className="space-y-1.5">
            {recentJobs.map(job => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all group"
              >
                <StatusBadge status={job.status} />
                <span className="flex-1 text-sm text-slate-400 truncate group-hover:text-slate-200 transition-colors">
                  {job.description}
                </span>
                {job.total_price_usdc != null && (
                  <span className="text-xs text-cyan-400 font-mono shrink-0">${job.total_price_usdc.toFixed(4)}</span>
                )}
                <span className="text-xs text-slate-600 shrink-0">
                  {new Date(job.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA if no orchestrator */}
      {!metrics && (
        <div className="max-w-2xl mx-auto px-6 pb-16">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center">
            <p className="text-slate-500 text-sm mb-1">Orchestrator not detected</p>
            <p className="text-xs text-slate-600 font-mono">cd orchestrator && npm start</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
