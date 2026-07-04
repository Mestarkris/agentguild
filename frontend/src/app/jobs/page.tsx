'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getJobs } from '@/lib/api';
import type { Job } from '@/lib/types';

const STATUS_COLOR: Record<string, string> = {
  completed: '#22c55e',
  settled:   '#22c55e',
  running:   '#ef9f27',
  planning:  '#60a5fa',
  settling:  '#facc15',
  failed:    '#ef4444',
  pending:   '#3a3a44',
};

const ACTIVE = new Set(['running', 'planning', 'settling']);

function elapsed(start: string, end: string | null): string {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  return `${(ms / 1000).toFixed(0)}s`;
}

const FILTERS = ['all', 'completed', 'running', 'planning', 'failed'] as const;

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    getJobs().then(setJobs).catch(() => setJobs([])).finally(() => setLoading(false));
    const t = setInterval(() => getJobs().then(setJobs).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);

  const count = (s: string) => s === 'all' ? jobs.length : jobs.filter(j => j.status === s).length;
  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white mb-0.5">Job Ledger</h1>
          <p className="text-xs font-mono text-[#4a4a55]">{jobs.length} total · refreshes every 5s</p>
        </div>
        <Link
          href="/"
          className="px-3 py-1.5 rounded-md border border-[rgba(239,159,39,0.3)] text-xs font-mono text-[#ef9f27] hover:bg-[rgba(239,159,39,0.08)] transition-colors"
        >
          + Submit Job
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex gap-1 mb-5 flex-wrap">
        {FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
              filter === s
                ? 'bg-[rgba(239,159,39,0.12)] text-[#ef9f27]'
                : 'text-[#4a4a55] hover:text-[#a0a0a8]'
            }`}
          >
            {s} <span className="opacity-50">({count(s)})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-xs font-mono text-[#3a3a44] py-8">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs font-mono text-[#3a3a44] py-8">
          {filter !== 'all' ? `No ${filter} jobs.` : 'No jobs yet.'}{' '}
          <Link href="/" className="text-[#ef9f27] hover:text-[#d68f22]">Submit one →</Link>
        </p>
      ) : (
        <div className="rounded-xl border border-[rgba(239,159,39,0.1)] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[rgba(239,159,39,0.08)]">
                <th className="text-left font-mono font-normal text-[#3a3a44] px-4 py-2.5 w-24">JOB ID</th>
                <th className="text-left font-normal text-[#3a3a44] px-2 py-2.5">DESCRIPTION</th>
                <th className="text-center font-normal text-[#3a3a44] px-2 py-2.5 w-8">ST</th>
                <th className="text-right font-mono font-normal text-[#3a3a44] px-2 py-2.5 w-32">USDC</th>
                <th className="text-right font-mono font-normal text-[#3a3a44] px-2 py-2.5 w-20">SUBMITTED</th>
                <th className="text-right font-mono font-normal text-[#3a3a44] px-4 py-2.5 w-16">DUR</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job, i) => {
                const isActive = ACTIVE.has(job.status);
                return (
                  <tr
                    key={job.id}
                    className={`border-b border-[rgba(239,159,39,0.05)] last:border-0 hover:bg-[rgba(239,159,39,0.04)] transition-colors ${
                      i % 2 === 0 ? 'bg-[#050508]' : 'bg-[#080810]'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="font-mono text-[#4a4a55] hover:text-[#ef9f27] transition-colors"
                      >
                        {job.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-2 py-3 max-w-0">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="text-[#a0a0a8] hover:text-white transition-colors truncate block"
                      >
                        {job.description}
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${isActive ? 'animate-pulse' : ''}`}
                        style={{ background: STATUS_COLOR[job.status] ?? '#3a3a44' }}
                        title={job.status}
                      />
                    </td>
                    <td className="px-2 py-3 text-right font-mono">
                      {job.total_price_usdc != null
                        ? <span className="text-[#ef9f27]">${job.total_price_usdc.toFixed(5)}</span>
                        : <span className="text-[#2a2a33]">—</span>
                      }
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-[#4a4a55]">
                      {new Date(job.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {job.completed_at
                        ? <span className="text-[#4a4a55]">{elapsed(job.submitted_at, job.completed_at)}</span>
                        : isActive
                        ? <span className="text-[#ef9f27] animate-pulse">{elapsed(job.submitted_at, null)}</span>
                        : <span className="text-[#2a2a33]">—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
