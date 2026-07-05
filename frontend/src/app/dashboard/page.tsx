'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import { getMetrics, getTransactions } from '@/lib/api';
import type { Metrics, Transaction } from '@/lib/types';
import { useTheme } from '@/lib/theme';

const SKILL_EMOJI: Record<string, string> = {
  summarizer: '📝', 'code-review': '🔍', research: '🔬', translate: '🌐',
  sentiment: '💭', sql: '🗃️', chart: '📊', extract: '⛏️',
  'legal-review': '⚖️', finance: '💹', transcribe: '🎙️', 'fact-check': '✅',
};

const CHART_COLORS_DARK  = ['#06b6d4', '#8b5cf6', '#22d3ee', '#a78bfa', '#67e8f9', '#c4b5fd', '#0891b2', '#7c3aed'];
const CHART_COLORS_LIGHT = ['#0891b2', '#7c3aed', '#0e7490', '#6d28d9', '#155e75', '#4c1d95', '#164e63', '#3b0764'];

function truncateTx(tx: string) {
  if (!tx) return '';
  return `${tx.slice(0, 10)}…${tx.slice(-6)}`;
}

function txLink(tx: string): string {
  if (!tx) return '';
  if (tx.startsWith('0x') && tx.length === 66) return `https://arc-explorer.thecanteenapp.com/tx/${tx}`;
  if (/^[0-9a-f-]{36}$/.test(tx)) return `https://developer.circle.com/w3s/transactions/${tx}`;
  return '';
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[var(--border-accent-dim)] bg-[var(--surface)] p-5 shadow-sm"
    >
      <div className="text-xs text-[var(--text-4)] uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono" style={{ color: color ?? 'var(--accent)' }}>{value}</div>
      {sub && <div className="text-xs text-[var(--text-5)] mt-0.5">{sub}</div>}
    </motion.div>
  );
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const CHART_COLORS = isDark ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;
  const gridStroke = isDark ? '#1e293b' : '#d8d0c8';
  const tickColor = isDark ? '#64748b' : '#52443c';
  // Cyan/purple stat colors — #06b6d4 is too low-contrast on white (2.1:1)
  const statCyan   = isDark ? '#06b6d4' : '#0e7490';
  const statPurple = isDark ? '#8b5cf6' : '#6d28d9';

  useEffect(() => {
    getMetrics().then(setMetrics).catch(() => {});
    getTransactions({ limit: 50 }).then(setTxs).catch(() => {});
    const t = setInterval(() => {
      getMetrics().then(setMetrics).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, []);

  const dailyData = (metrics?.daily_stats ?? []).map(d => ({
    date: d.date.slice(5),
    Jobs: d.jobs,
    USDC: parseFloat(d.usdc?.toFixed(5) ?? '0'),
  }));

  const pieData = (metrics?.skills_distribution ?? []).map(s => ({
    name: s.skill,
    value: s.count,
  }));

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-accent-dim)] rounded-lg px-3 py-2 text-xs shadow-lg">
        <div className="text-[var(--text-4)] mb-1">{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' && p.value < 1 ? `$${p.value.toFixed(5)}` : p.value}</div>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--text-1)] mb-1">Analytics Dashboard</h1>
        <p className="text-[var(--text-3)] text-sm">Live metrics from Arc Testnet · refreshes every 10s</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="USDC Settled" value={`$${(metrics?.totals.usdc_settled ?? 0).toFixed(4)}`} sub="on Arc Testnet" color={statCyan} />
        <StatCard label="Jobs Completed" value={String(metrics?.totals.jobs_completed ?? 0)} sub={`of ${metrics?.totals.total_jobs ?? 0} submitted`} color={statPurple} />
        <StatCard label="Avg Settlement" value={`${(metrics?.totals.avg_settlement_secs ?? 0).toFixed(1)}s`} sub="per job" color={statCyan} />
        <StatCard label="Agents Earning" value={String(metrics?.totals.agents_earning ?? 0)} sub={`of ${metrics?.totals.agents_registered ?? 0} registered`} color={statPurple} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Daily jobs chart */}
        <div className="rounded-xl border border-[var(--border-accent-dim)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--text-1)] mb-4">Daily Activity (last 7 days)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="date" tick={{ fill: tickColor, fontSize: 11 }} />
              <YAxis yAxisId="jobs" orientation="left" tick={{ fill: tickColor, fontSize: 11 }} />
              <YAxis yAxisId="usdc" orientation="right" tick={{ fill: tickColor, fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar yAxisId="jobs" dataKey="Jobs" fill="#06b6d4" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="usdc" dataKey="USDC" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-xs text-[var(--text-4)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-cyan-400 inline-block dark:bg-cyan-400 bg-cyan-600" />Jobs</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block bg-violet-600 dark:bg-violet-500" />USDC</span>
          </div>
        </div>

        {/* Skills distribution */}
        <div className="rounded-xl border border-[var(--border-accent-dim)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--text-1)] mb-4">Skill Distribution (by subtask count)</h2>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [v, 'subtasks']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 overflow-auto max-h-40">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-[var(--text-2)]">{SKILL_EMOJI[d.name] ?? '🤖'} {d.name}</span>
                    <span className="ml-auto text-[var(--text-4)]">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-[var(--text-5)] text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Agent leaderboard */}
      <div className="rounded-xl border border-[var(--border-accent-dim)] bg-[var(--surface)] p-5 shadow-sm mb-8">
        <h2 className="text-sm font-semibold text-[var(--text-1)] mb-4">Agent Leaderboard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-4)] border-b border-[var(--border-subtle)]">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Agent</th>
                <th className="pb-2 pr-4">Skill</th>
                <th className="pb-2 pr-4 text-right">Jobs</th>
                <th className="pb-2 pr-4 text-right">USDC Earned</th>
                <th className="pb-2 pr-4 text-right">Avg Quality</th>
                <th className="pb-2 text-right">Bond Health</th>
              </tr>
            </thead>
            <tbody>
              {(metrics?.leaderboard ?? []).map((a, i) => {
                const bondHealth = a.bond_amount > 0 ? (a.bond_available ?? (a.bond_amount - a.bond_slashed)) / a.bond_amount : 1;
                const pct = Math.round(bondHealth * 100);
                return (
                  <tr key={a.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--tint-accent)]">
                    <td className="py-2 pr-4 text-[var(--text-5)]">{i + 1}</td>
                    <td className="py-2 pr-4 text-[var(--text-1)] font-medium">{a.name}</td>
                    <td className="py-2 pr-4 text-[var(--text-3)]">{SKILL_EMOJI[a.skill]} {a.skill}</td>
                    <td className="py-2 pr-4 text-right text-[var(--text-2)]">{a.total_jobs}</td>
                    <td className="py-2 pr-4 text-right font-mono" style={{ color: statCyan }}>${a.total_earned.toFixed(5)}</td>
                    <td className="py-2 pr-4 text-right text-[var(--text-2)]">{a.avg_quality.toFixed(3)}</td>
                    <td className="py-2 text-right">
                      <span className={pct > 66 ? 'text-green-500 dark:text-green-400' : pct > 33 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500 dark:text-red-400'}>
                        {pct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction feed */}
      <div className="rounded-xl border border-[var(--border-accent-dim)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-1)]">Recent On-Chain Transactions</h2>
          <span className="text-xs text-[var(--text-4)]">{txs.filter(t => !t.demo).length} real · {txs.filter(t => t.demo).length} demo</span>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {txs.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-5)] text-sm">No transactions yet</div>
          ) : txs.map(tx => {
            const href = txLink(tx.tx_hash);
            return (
              <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-[var(--border-subtle)] text-xs">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${tx.demo ? 'bg-yellow-500 dark:bg-yellow-400' : 'bg-green-500 dark:bg-green-400'}`} />
                <div className="shrink-0">
                  <span className="text-[var(--text-2)]">{SKILL_EMOJI[tx.agent_skill] ?? '🤖'} {tx.agent_name}</span>
                </div>
                <div className="flex-1 text-[var(--text-5)] truncate">{tx.job_description?.slice(0, 50)}</div>
                <div className="font-mono shrink-0" style={{ color: statCyan }}>${tx.amount_usdc.toFixed(5)}</div>
                <div className="shrink-0">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-cyan-700 dark:text-cyan-500 hover:text-cyan-500 dark:hover:text-cyan-300 transition-colors">
                      {truncateTx(tx.tx_hash)} ↗
                    </a>
                  ) : (
                    <span className="font-mono text-[var(--text-5)]">{tx.demo ? 'demo' : truncateTx(tx.tx_hash)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
