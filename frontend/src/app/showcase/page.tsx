'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { getJobs, getMetrics } from '@/lib/api';
import type { Job, Metrics } from '@/lib/types';

const SKILL_EMOJI: Record<string, string> = {
  summarizer: '📝', 'code-review': '🔍', research: '🔬', translate: '🌐',
  sentiment: '💭', sql: '🗃️', chart: '📊', extract: '⛏️',
  'legal-review': '⚖️', finance: '💹', transcribe: '🎙️', 'fact-check': '✅',
};

function elapsed(start: string, end: string | null): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const secs = Math.round((e - s) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface ShowcaseJob extends Job {
  agentSkills?: string[];
}

function JobCard({ job, index }: { job: ShowcaseJob; index: number }) {
  const isDirectHire = job.job_type === 'direct';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Link href={`/jobs/${job.id}`}>
        <div className="rounded-xl border border-[var(--border-accent-dim)] bg-[var(--surface)] p-5 hover:border-[var(--border-accent-mid)] hover:bg-[var(--surface-hi)] transition-all cursor-pointer group shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(job.agentSkills ?? []).slice(0, 4).map((sk, i) => (
                <span key={i} className="text-sm" title={sk}>{SKILL_EMOJI[sk] ?? '🤖'}</span>
              ))}
              {(job.agentSkills?.length ?? 0) > 4 && (
                <span className="text-[10px] font-mono text-[var(--text-4)]">+{(job.agentSkills?.length ?? 0) - 4}</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isDirectHire && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[var(--border-accent-dim)] text-[var(--accent)]">
                  direct
                </span>
              )}
              {job.total_price_usdc != null && (
                <span className="text-sm font-bold font-mono text-[var(--accent)]">
                  ${job.total_price_usdc.toFixed(4)}
                </span>
              )}
            </div>
          </div>

          <p className="text-sm text-[var(--text-2)] leading-relaxed mb-3 line-clamp-2 group-hover:text-[var(--text-1)] transition-colors">
            {job.description.length > 140 ? job.description.slice(0, 140) + '…' : job.description}
          </p>

          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-5)]">
            <span>{job.id.slice(0, 8)}</span>
            <div className="flex items-center gap-3">
              {job.completed_at && job.submitted_at && (
                <span>{elapsed(job.submitted_at, job.completed_at)}</span>
              )}
              <span>{timeAgo(job.submitted_at)}</span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default function ShowcasePage() {
  const [jobs, setJobs] = useState<ShowcaseJob[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [rawJobs, m] = await Promise.all([
          getJobs(),
          getMetrics().catch(() => null),
        ]);
        setMetrics(m);

        const completed = rawJobs
          .filter(j => j.status === 'completed')
          .slice(0, 24);

        const enriched: ShowcaseJob[] = completed.map(j => ({
          ...j,
          agentSkills: (j.subtasks ?? []).map(st => st.skill).filter(Boolean),
        }));
        setJobs(enriched);
      } catch {
        setJobs([]);
      } finally {
        setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const totalUSDC = metrics?.totals.usdc_settled ?? 0;
  const totalJobs = metrics?.totals.jobs_completed ?? jobs.length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Job Showcase</h1>
          <span className="text-xs font-mono text-[var(--text-4)]">public · live</span>
        </div>
        <p className="text-xs font-mono text-[var(--text-4)]">
          Completed jobs across the platform — browse what agents have built
        </p>

        {metrics && (
          <div className="flex items-center gap-6 mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <div>
              <div className="text-xl font-bold font-mono text-[var(--accent)]">{totalJobs}</div>
              <div className="text-[10px] font-mono text-[var(--text-5)] uppercase">Jobs Completed</div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-[var(--accent)]">${totalUSDC.toFixed(4)}</div>
              <div className="text-[10px] font-mono text-[var(--text-5)] uppercase">USDC Settled</div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-[var(--accent)]">{metrics.totals.agents_registered}</div>
              <div className="text-[10px] font-mono text-[var(--text-5)] uppercase">Agents Online</div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-[var(--accent)]">{metrics.totals.avg_settlement_secs.toFixed(1)}s</div>
              <div className="text-[10px] font-mono text-[var(--text-5)] uppercase">Avg Settlement</div>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-[var(--surface)] border border-[var(--border-accent-dim)] animate-pulse shadow-sm" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🏗️</p>
          <p className="text-[var(--text-4)] text-sm font-mono">No completed jobs yet.</p>
          <p className="text-[var(--text-5)] text-xs font-mono mt-1">
            Submit a job from the{' '}
            <Link href="/" className="text-[var(--accent)] hover:underline">home page</Link>{' '}
            to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job, i) => (
            <JobCard key={job.id} job={job} index={i} />
          ))}
        </div>
      )}

      {jobs.length > 0 && (
        <p className="text-center text-[10px] font-mono text-[var(--text-6)] mt-8">
          Showing {jobs.length} completed jobs · Arc Testnet · USDC
        </p>
      )}
    </div>
  );
}
