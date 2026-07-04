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
          style={{ background: i < filled ? '#ef9f27' : 'rgba(239,159,39,0.15)' }}
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
      className="relative rounded-xl border border-[rgba(239,159,39,0.1)] bg-[#0d0d14] overflow-hidden flex flex-col hover:border-[rgba(239,159,39,0.3)] hover:bg-[#0f0f18] transition-all cursor-pointer"
    >
      {/* Bond health strip — left edge, fills from top, height = % of bond remaining */}
      <div className="absolute top-0 left-0 w-0.5 h-full bg-[#0d0d14]">
        <div
          className="w-full transition-all duration-1000"
          style={{
            height: `${healthPct}%`,
            background: bondColor(health),
            opacity: 0.7,
          }}
        />
      </div>

      <div className="flex-1 flex flex-col gap-3 p-4 pl-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-white text-sm leading-tight">{agent.name}</div>
            <div className="text-[10px] font-mono text-[#4a4a55] mt-0.5">{agent.skill}</div>
          </div>
          {/* Status dot */}
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${isActive ? 'animate-pulse' : ''}`}
              style={{ background: isActive ? '#ef9f27' : '#3a3a44' }}
            />
            <span className={`text-[10px] font-mono ${isActive ? 'text-[#ef9f27]' : 'text-[#3a3a44]'}`}>
              {agent.status}
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-[#6b6b78] leading-relaxed">{agent.description}</p>

        {/* Price + quality */}
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-base font-bold font-mono text-white">${agent.price_usdc}</span>
            <span className="text-[10px] text-[#4a4a55]">/ {agent.price_unit}</span>
          </div>
          <QualityDots score={agent.avg_quality} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[rgba(239,159,39,0.06)]">
          <div className="text-[10px] text-[#4a4a55] font-mono">
            <span className="text-[#a0a0a8]">{agent.total_jobs}</span> jobs{' · '}
            <span
              className={`${isActive && agent.total_earned > 0 ? 'text-[#ef9f27]' : 'text-[#a0a0a8]'} ${
                isActive && agent.total_earned > 0 ? 'animate-pulse' : ''
              }`}
            >
              ${agent.total_earned.toFixed(4)}
            </span>{' '}
            earned
          </div>
          <div
            className="text-[10px] font-mono text-[#3a3a44] hover:text-[#6b6b78] transition-colors cursor-default"
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
        <h1 className="text-2xl font-bold text-white mb-0.5">Agent Marketplace</h1>
        <p className="text-xs font-mono text-[#4a4a55]">
          {agents.length} agents registered · x402-gated · paid in USDC on Arc
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-[#0d0d14] border border-[rgba(239,159,39,0.06)] animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <p className="text-xs font-mono text-[#3a3a44] py-8">
          No agents registered. Start the orchestrator to seed the registry:{' '}
          <span className="text-[#ef9f27]">cd orchestrator && npm start</span>
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
