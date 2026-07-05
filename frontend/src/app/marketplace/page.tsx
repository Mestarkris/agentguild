'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { getAgents } from '@/lib/api';
import type { Agent } from '@/lib/types';

function truncAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function bondHealth(agent: Agent): number {
  return agent.bond_amount > 0
    ? Math.max(0, (agent.bond_amount - agent.bond_slashed) / agent.bond_amount)
    : 1;
}

function bondColor(h: number): string {
  if (h > 0.66) return '#22c55e';
  if (h > 0.33) return '#facc15';
  return '#ef4444';
}

function QualityDots({ score }: { score: number }) {
  const filled = Math.round(score * 5);
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: i < filled ? 'var(--accent)' : 'var(--border-accent-dim)' }}
        />
      ))}
    </div>
  );
}

function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const health = bondHealth(agent);
  const isActive = agent.status === 'available';
  const healthPct = Math.round(health * 100);

  return (
    <Link href={`/agents/${agent.id}`}>
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="relative rounded-xl border border-[var(--border-accent-dim)] bg-[var(--surface)] overflow-hidden flex flex-col hover:border-[var(--border-accent-mid)] hover:bg-[var(--surface-hi)] transition-all cursor-pointer shadow-sm"
    >
      {/* Bond health strip */}
      <div className="absolute top-0 left-0 w-0.5 h-full bg-[var(--surface)]">
        <div
          className="w-full transition-all duration-1000"
          style={{ height: `${healthPct}%`, background: bondColor(health), opacity: 0.7 }}
        />
      </div>

      <div className="flex-1 flex flex-col gap-3 p-4 pl-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-[var(--text-1)] text-sm leading-tight">{agent.name}</div>
            <div className="text-[10px] font-mono text-[var(--text-4)] mt-0.5">{agent.skill}</div>
          </div>
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${isActive ? 'animate-pulse' : ''}`}
              style={{ background: isActive ? 'var(--accent)' : 'var(--text-5)' }}
            />
            <span className="text-[10px] font-mono" style={{ color: isActive ? 'var(--accent)' : 'var(--text-5)' }}>
              {agent.status}
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-[var(--text-3)] leading-relaxed">{agent.description}</p>

        {/* Price + quality */}
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-base font-bold font-mono text-[var(--text-1)]">${agent.price_usdc}</span>
            <span className="text-[10px] text-[var(--text-4)]">/ {agent.price_unit}</span>
          </div>
          <QualityDots score={agent.avg_quality} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
          <div className="text-[10px] text-[var(--text-4)] font-mono">
            <span className="text-[var(--text-2)]">{agent.total_jobs}</span> jobs{' · '}
            <span
              style={{ color: isActive && agent.total_earned > 0 ? 'var(--accent)' : 'var(--text-2)' }}
              className={isActive && agent.total_earned > 0 ? 'animate-pulse' : ''}
            >
              ${agent.total_earned.toFixed(4)}
            </span>{' '}
            earned
          </div>
          <div
            className="text-[10px] font-mono text-[var(--text-5)] hover:text-[var(--text-3)] transition-colors cursor-default"
            title={agent.wallet_address}
          >
            {truncAddr(agent.wallet_address)}
          </div>
        </div>
      </div>
    </motion.div>
    </Link>
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
        <h1 className="text-2xl font-bold text-[var(--text-1)] mb-0.5">Agent Marketplace</h1>
        <p className="text-xs font-mono text-[var(--text-4)]">
          {agents.length} agents registered · x402-gated · paid in USDC on Arc
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-[var(--surface)] border border-[var(--border-accent-dim)] animate-pulse shadow-sm" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <p className="text-xs font-mono text-[var(--text-5)] py-8">
          No agents registered. Start the orchestrator to seed the registry:{' '}
          <span className="text-[var(--accent)]">cd orchestrator && npm start</span>
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent, i) => (
            <AgentCard key={agent.id} agent={agent} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
