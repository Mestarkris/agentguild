'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getAgents } from '@/lib/api';
import type { Agent } from '@/lib/types';

const SKILL_EMOJI: Record<string, string> = {
  summarizer: '📝',
  'code-review': '🔍',
  research: '🔬',
  translate: '🌐',
  sentiment: '💭',
  sql: '🗃️',
  chart: '📊',
  extract: '⛏️',
  'legal-review': '⚖️',
  finance: '💹',
  transcribe: '🎙️',
  'fact-check': '✅',
};

const SKILL_COLOR: Record<string, string> = {
  summarizer: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
  'code-review': 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
  research: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
  translate: 'from-green-500/20 to-green-600/10 border-green-500/30',
  sentiment: 'from-pink-500/20 to-pink-600/10 border-pink-500/30',
  sql: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
  chart: 'from-violet-500/20 to-violet-600/10 border-violet-500/30',
  extract: 'from-teal-500/20 to-teal-600/10 border-teal-500/30',
  'legal-review': 'from-red-500/20 to-red-600/10 border-red-500/30',
  finance: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
  transcribe: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30',
  'fact-check': 'from-lime-500/20 to-lime-600/10 border-lime-500/30',
};

function truncateAddr(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function QualityDots({ score }: { score: number }) {
  const filled = Math.round(score * 5);
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < filled ? 'bg-cyan-400' : 'bg-slate-700'}`} />
      ))}
    </div>
  );
}

function BondBar({ bond_amount, bond_slashed }: { bond_amount: number; bond_slashed: number }) {
  const health = bond_amount > 0 ? Math.max(0, (bond_amount - bond_slashed) / bond_amount) : 1;
  const pct = Math.round(health * 100);
  const color = pct > 66 ? 'bg-green-500' : pct > 33 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>Bond</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Marketplace() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAgents()
      .then(setAgents)
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Agent Marketplace</h1>
        <p className="text-slate-400 text-sm">
          {agents.length} agents available · Each is an x402-gated AI service priced per unit · Paid in USDC on Arc
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-4xl mb-3">🔌</p>
          <p>No agents found. Start the orchestrator to seed the registry.</p>
          <p className="text-xs font-mono mt-2 text-slate-600">cd orchestrator && npm start</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`rounded-xl border bg-gradient-to-br p-4 flex flex-col gap-3 ${
                SKILL_COLOR[agent.skill] ?? 'from-slate-800/50 to-slate-900/50 border-slate-700'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{SKILL_EMOJI[agent.skill] ?? '🤖'}</div>
                  <div>
                    <div className="font-semibold text-white text-sm">{agent.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{agent.skill}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  {agent.status}
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-slate-400 leading-relaxed">{agent.description}</p>

              {/* Price */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-lg font-bold font-mono text-white">${agent.price_usdc}</span>
                  <span className="text-xs text-slate-500 ml-1">/ {agent.price_unit}</span>
                </div>
                <QualityDots score={agent.avg_quality} />
              </div>

              {/* Bond */}
              <BondBar bond_amount={agent.bond_amount} bond_slashed={agent.bond_slashed} />

              {/* Footer stats */}
              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <div className="text-xs text-slate-500">
                  <span className="text-slate-300">{agent.total_jobs}</span> jobs ·{' '}
                  <span className="text-cyan-400">${agent.total_earned.toFixed(4)}</span> earned
                </div>
                <div
                  className="text-xs font-mono text-slate-600 cursor-pointer hover:text-slate-400 transition-colors"
                  title={agent.wallet_address}
                >
                  {truncateAddr(agent.wallet_address)}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
