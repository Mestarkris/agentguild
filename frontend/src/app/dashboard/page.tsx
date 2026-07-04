'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import { getMetrics, getTransactions } from '@/lib/api';
import type { Metrics, Transaction } from '@/lib/types';

const SKILL_EMOJI: Record<string, string> = {
  summarizer: '📝', 'code-review': '🔍', research: '🔬', translate: '🌐',
  sentiment: '💭', sql: '🗃️', chart: '📊', extract: '⛏️',
  'legal-review': '⚖️', finance: '💹', transcribe: '🎙️', 'fact-check': '✅',
};

const CHART_COLORS = ['#06b6d4', '#8b5cf6', '#22d3ee', '#a78bfa', '#67e8f9', '#c4b5fd', '#0891b2', '#7c3aed'];

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

function StatCard({ label, value, sub, color = 'text-cyan-400' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
    >
      <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
    </motion.div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs">
      <div className="text-slate-400 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' && p.value < 1 ? `$${p.value.toFixed(5)}` : p.value}</div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);

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

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Analytics Dashboard</h1>
        <p className="text-slate-400 text-sm">Live metrics from Arc Testnet · refreshes every 10s</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="USDC Settled" value={`$${(metrics?.totals.usdc_settled ?? 0).toFixed(4)}`} sub="on Arc Testnet" color="text-cyan-400" />
        <StatCard label="Jobs Completed" value={String(metrics?.totals.jobs_completed ?? 0)} sub={`of ${metrics?.totals.total_jobs ?? 0} submitted`} color="text-violet-400" />
        <StatCard label="Avg Settlement" value={`${(metrics?.totals.avg_settlement_secs ?? 0).toFixed(1)}s`} sub="per job" color="text-cyan-400" />
        <StatCard label="Agents Earning" value={String(metrics?.totals.agents_earning ?? 0)} sub={`of ${metrics?.totals.agents_registered ?? 0} registered`} color="text-violet-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Daily jobs chart */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Daily Activity (last 7 days)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis yAxisId="jobs" orientation="left" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis yAxisId="usdc" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar yAxisId="jobs" dataKey="Jobs" fill="#06b6d4" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="usdc" dataKey="USDC" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-cyan-400 inline-block" />Jobs</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-500 inline-block" />USDC</span>
          </div>
        </div>

        {/* Skills distribution */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Skill Distribution (by subtask count)</h2>
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
                    <span className="text-slate-300">{SKILL_EMOJI[d.name] ?? '🤖'} {d.name}</span>
                    <span className="ml-auto text-slate-500">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-slate-600 text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Agent leaderboard */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 mb-8">
        <h2 className="text-sm font-semibold text-white mb-4">Agent Leaderboard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
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
                  <tr key={a.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                    <td className="py-2 pr-4 text-slate-600">{i + 1}</td>
                    <td className="py-2 pr-4 text-white font-medium">{a.name}</td>
                    <td className="py-2 pr-4 text-slate-400">{SKILL_EMOJI[a.skill]} {a.skill}</td>
                    <td className="py-2 pr-4 text-right text-slate-300">{a.total_jobs}</td>
                    <td className="py-2 pr-4 text-right text-cyan-400 font-mono">${a.total_earned.toFixed(5)}</td>
                    <td className="py-2 pr-4 text-right text-slate-300">{a.avg_quality.toFixed(3)}</td>
                    <td className="py-2 text-right">
                      <span className={pct > 66 ? 'text-green-400' : pct > 33 ? 'text-yellow-400' : 'text-red-400'}>
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
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Recent On-Chain Transactions</h2>
          <span className="text-xs text-slate-500">{txs.filter(t => !t.demo).length} real · {txs.filter(t => t.demo).length} demo</span>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {txs.length === 0 ? (
            <div className="text-center py-8 text-slate-600 text-sm">No transactions yet</div>
          ) : txs.map(tx => {
            const href = txLink(tx.tx_hash);
            return (
              <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-slate-800/40 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${tx.demo ? 'bg-yellow-400' : 'bg-green-400'}`} />
                <div className="shrink-0">
                  <span className="text-slate-300">{SKILL_EMOJI[tx.agent_skill] ?? '🤖'} {tx.agent_name}</span>
                </div>
                <div className="flex-1 text-slate-600 truncate">{tx.job_description?.slice(0, 50)}</div>
                <div className="text-cyan-400 font-mono shrink-0">${tx.amount_usdc.toFixed(5)}</div>
                <div className="shrink-0">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-cyan-700 hover:text-cyan-400 transition-colors">
                      {truncateTx(tx.tx_hash)} ↗
                    </a>
                  ) : (
                    <span className="font-mono text-slate-600">{tx.demo ? 'demo' : truncateTx(tx.tx_hash)}</span>
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
