'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getJob, flagJob } from '@/lib/api';
import type { Job, Subtask } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';

const SKILL_EMOJI: Record<string, string> = {
  summarizer: '📝', 'code-review': '🔍', research: '🔬', translate: '🌐',
  sentiment: '💭', sql: '🗃️', chart: '📊', extract: '⛏️',
  'legal-review': '⚖️', finance: '💹', transcribe: '🎙️', 'fact-check': '✅',
};

const DONE = new Set(['completed', 'failed']);

function elapsed(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return `${((e - s) / 1000).toFixed(1)}s`;
}

function truncateTx(tx: string) {
  return tx ? `${tx.slice(0, 10)}…${tx.slice(-6)}` : '';
}

function txLink(tx: string): string {
  if (!tx) return '';
  // Real on-chain Arc tx hash starts with 0x and is 66 chars
  if (tx.startsWith('0x') && tx.length === 66) {
    return `https://arc-explorer.thecanteenapp.com/tx/${tx}`;
  }
  // Circle transaction UUID — link to Circle developer console
  if (/^[0-9a-f-]{36}$/.test(tx)) {
    return `https://developer.circle.com/w3s/transactions/${tx}`;
  }
  return '';
}

// Pipeline node for each subtask
function SubtaskNode({ st, index, total }: { st: Subtask; index: number; total: number }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = st.status === 'running';
  const isDone = st.status === 'completed' || st.status === 'settled';
  const isFailed = st.status === 'failed';
  const isPending = st.status === 'pending';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.08 }}
      className="relative"
    >
      {/* Connector line (not after last) */}
      {index < total - 1 && (
        <div className="absolute left-6 top-full w-0.5 h-4 bg-slate-800 z-0" />
      )}

      <div
        className={`relative rounded-xl border transition-all ${
          isRunning
            ? 'border-cyan-500/60 bg-cyan-950/30 node-pulse'
            : isDone
            ? 'border-green-500/30 bg-green-950/10'
            : isFailed
            ? 'border-red-500/30 bg-red-950/10'
            : 'border-slate-800 bg-slate-900/60'
        }`}
      >
        <div
          className="flex items-start gap-3 p-4 cursor-pointer select-none"
          onClick={() => (isDone || isFailed) && setExpanded(e => !e)}
        >
          {/* Position + status ring */}
          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 ${
            isRunning ? 'border-cyan-400 bg-cyan-950' :
            isDone ? 'border-green-500 bg-green-950' :
            isFailed ? 'border-red-500 bg-red-950' :
            'border-slate-700 bg-slate-800'
          }`}>
            {isPending ? (
              <span className="text-xs text-slate-500 font-bold">{st.position}</span>
            ) : isRunning ? (
              <span className="animate-spin text-xs">⚙️</span>
            ) : isDone ? (
              <span>✅</span>
            ) : isFailed ? (
              <span>❌</span>
            ) : (
              <span>{SKILL_EMOJI[st.skill] ?? '🤖'}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">
                {SKILL_EMOJI[st.skill]} {st.skill}
              </span>
              {st.agent_name && (
                <span className="text-xs text-slate-500 font-mono">{st.agent_name}</span>
              )}
              <StatusBadge status={st.status} />
            </div>
            <p className="text-xs text-slate-500 mt-1 truncate">{st.prompt}</p>
          </div>

          <div className="text-right shrink-0">
            {st.payment_usdc != null && (
              <div className="text-sm font-bold text-cyan-400 font-mono">${st.payment_usdc.toFixed(5)}</div>
            )}
            {st.contribution_pct != null && (
              <div className="text-xs text-slate-500">{(st.contribution_pct * 100).toFixed(1)}%</div>
            )}
            {isRunning && (
              <div className="text-xs text-cyan-400 animate-pulse">working…</div>
            )}
            {(isDone || isFailed) && (
              <div className="text-xs text-slate-600 mt-1">{elapsed(st.started_at, st.completed_at)}</div>
            )}
          </div>
        </div>

        {/* Expanded result */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3 border-t border-slate-800/60 pt-3">
                {st.result && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Result</div>
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap bg-slate-950 rounded-lg p-3 overflow-auto max-h-48 font-mono">
                      {st.result}
                    </pre>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {st.tokens_used > 0 && (
                    <Chip label="Tokens" value={String(st.tokens_used)} />
                  )}
                  {st.quality_score > 0 && (
                    <Chip label="Quality" value={st.quality_score.toFixed(2)} />
                  )}
                  {st.complexity_weight > 0 && (
                    <Chip label="Complexity" value={`×${st.complexity_weight}`} />
                  )}
                  {st.payment_tx && (() => {
                    const href = txLink(st.payment_tx);
                    return (
                      <Chip label="Tx" value={truncateTx(st.payment_tx)} mono href={href} />
                    );
                  })()}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Chip({ label, value, mono, href }: { label: string; value: string; mono?: boolean; href?: string }) {
  return (
    <div className="bg-slate-900 rounded-lg px-2.5 py-1.5">
      <div className="text-slate-500">{label}</div>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
          className={`text-cyan-400 hover:text-cyan-300 mt-0.5 block transition-colors ${mono ? 'font-mono' : 'font-medium'}`}>
          {value} ↗
        </a>
      ) : (
        <div className={`text-white mt-0.5 ${mono ? 'font-mono' : 'font-medium'}`}>{value}</div>
      )}
    </div>
  );
}

// Animated payment split at the bottom
function PaymentSummary({ subtasks, total }: { subtasks: Subtask[]; total: number }) {
  const settled = subtasks.filter(s => s.status === 'settled' && s.payment_usdc != null);
  if (settled.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-700 bg-slate-900/60 p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Payment Settlement</h3>
        <div className="text-cyan-400 font-bold font-mono">${total.toFixed(5)} USDC</div>
      </div>

      <div className="space-y-3">
        {settled.map((st, i) => {
          const pct = st.contribution_pct ?? 0;
          return (
            <motion.div
              key={st.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span>{SKILL_EMOJI[st.skill] ?? '🤖'}</span>
                  <span className="text-slate-300">{st.agent_name ?? st.skill}</span>
                  {st.payment_tx && (() => {
                    const href = txLink(st.payment_tx);
                    const label = truncateTx(st.payment_tx);
                    return href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className="text-cyan-700 hover:text-cyan-400 font-mono transition-colors"
                        title={st.payment_tx}>
                        {label} ↗
                      </a>
                    ) : (
                      <span className="text-slate-600 font-mono" title={st.payment_tx}>{label}</span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{(pct * 100).toFixed(1)}%</span>
                  <span className="text-cyan-400 font-bold font-mono">${st.payment_usdc!.toFixed(5)}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct * 100}%` }}
                  transition={{ duration: 0.8, delay: i * 0.1 }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      <p className="text-xs text-slate-600 mt-3 text-center">Settled on Arc Testnet (chain 1111)</p>
    </motion.div>
  );
}

export default function JobPage() {
  const { id } = useParams() as { id: string };
  const [job, setJob] = useState<Job | null>(null);
  const [notFound, setNotFound] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJob = useCallback(async () => {
    try {
      const j = await getJob(id);
      setJob(j);
      if (DONE.has(j.status)) {
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    } catch (e: unknown) {
      if ((e as { response?: { status?: number } })?.response?.status === 404) setNotFound(true);
    }
  }, [id]);

  useEffect(() => {
    fetchJob();
    pollingRef.current = setInterval(fetchJob, 2000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchJob]);

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <p className="text-4xl mb-3">🔍</p>
        <p className="text-slate-400">Job not found</p>
        <Link href="/" className="text-cyan-400 text-sm mt-4 block">← Back to home</Link>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 text-sm">Loading job…</p>
      </div>
    );
  }

  const subtasks = job.subtasks ?? [];
  const isActive = !DONE.has(job.status);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="text-xs text-slate-600 hover:text-slate-400 transition-colors mb-4 block">← All Jobs</Link>

        <div className="flex items-start gap-3 mb-3">
          <StatusBadge status={job.status} size="md" />
          {isActive && <span className="text-xs text-slate-500 animate-pulse pt-1">Polling…</span>}
        </div>

        <h1 className="text-xl font-semibold text-white mb-1 leading-snug">{job.description}</h1>

        <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
          <span className="font-mono">{job.id.slice(0, 8)}</span>
          <span>{new Date(job.submitted_at).toLocaleString()}</span>
          {job.total_price_usdc != null && (
            <span className="text-cyan-400 font-bold">${job.total_price_usdc.toFixed(5)} USDC</span>
          )}
        </div>

        {job.error && (
          <div className="mt-3 text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
            {job.error}
          </div>
        )}
      </div>

      {/* Status timeline for phases without subtasks yet */}
      {subtasks.length === 0 && (
        <div className="space-y-2 mb-8">
          {(['pending', 'planning', 'running'] as const).map(phase => {
            const phases = ['pending', 'planning', 'running', 'settling', 'completed'];
            const jobPhaseIdx = phases.indexOf(job.status);
            const thisPhaseIdx = phases.indexOf(phase);
            const active = thisPhaseIdx === jobPhaseIdx;
            const done = thisPhaseIdx < jobPhaseIdx;
            return (
              <div key={phase} className={`flex items-center gap-3 rounded-lg px-4 py-3 border ${
                active ? 'border-cyan-500/40 bg-cyan-950/20' :
                done ? 'border-green-500/20 bg-transparent' :
                'border-slate-800 bg-transparent opacity-40'
              }`}>
                <div className={`w-2 h-2 rounded-full ${active ? 'bg-cyan-400 animate-pulse' : done ? 'bg-green-500' : 'bg-slate-700'}`} />
                <span className="text-sm capitalize text-slate-300">{phase}</span>
                {active && <span className="text-xs text-slate-500 ml-auto">in progress…</span>}
                {done && <span className="text-xs text-green-500 ml-auto">✓</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Subtask pipeline */}
      {subtasks.length > 0 && (
        <div className="space-y-3 mb-8">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Execution Pipeline · {subtasks.length} subtask{subtasks.length !== 1 ? 's' : ''}
          </h2>
          {subtasks.map((st, i) => (
            <SubtaskNode key={st.id} st={st} index={i} total={subtasks.length} />
          ))}
          <p className="text-xs text-slate-600 text-center pt-1">
            {DONE.has(job.status) ? 'Click any subtask to expand result' : 'Updating every 2s…'}
          </p>
        </div>
      )}

      {/* Payment summary */}
      {job.total_price_usdc != null && subtasks.some(s => s.status === 'settled') && (
        <PaymentSummary subtasks={subtasks} total={job.total_price_usdc} />
      )}

      {/* Completed banner */}
      <AnimatePresence>
        {job.status === 'completed' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 rounded-xl border border-green-500/30 bg-green-950/20 p-4 text-center"
          >
            <div className="text-2xl mb-1">🎉</div>
            <p className="text-green-400 font-semibold text-sm">Job Complete</p>
            <p className="text-slate-500 text-xs mt-1">
              {subtasks.length} agents · ${job.total_price_usdc?.toFixed(5)} USDC settled on Arc
            </p>
            <Link href="/" className="mt-3 inline-block text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
              Submit another job →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
