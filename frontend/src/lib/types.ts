export interface Agent {
  id: string;
  name: string;
  skill: string;
  description: string;
  price_usdc: number;
  price_unit: string;
  wallet_id: string;
  wallet_address: string;
  bond_amount: number;
  bond_slashed: number;
  status: string;
  base_url: string;
  total_jobs: number;
  total_earned: number;
  avg_quality: number;
  bond_available?: number;
  registered_at: string;
  last_active: string | null;
}

export interface Subtask {
  id: string;
  job_id: string;
  agent_id: string;
  agent_name: string;
  skill: string;
  prompt: string;
  result: string | null;
  tokens_used: number;
  complexity_weight: number;
  quality_score: number;
  contribution_pct: number | null;
  payment_usdc: number | null;
  payment_tx: string | null;
  status: 'pending' | 'running' | 'completed' | 'settled' | 'failed';
  position: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface Job {
  id: string;
  description: string;
  status: 'pending' | 'planning' | 'running' | 'settling' | 'completed' | 'failed';
  total_price_usdc: number | null;
  result: string | null;
  error: string | null;
  submitted_at: string;
  completed_at: string | null;
  job_type?: 'auto' | 'direct';
  direct_agent_id?: string | null;
  subtasks?: Subtask[];
}

export interface Transaction {
  id: string;
  job_id: string;
  agent_id: string;
  amount_usdc: number;
  tx_hash: string;
  demo: number;
  created_at: string;
  agent_name: string;
  agent_skill: string;
  job_description: string;
}

export interface DailyStat {
  date: string;
  jobs: number;
  usdc: number;
}

export interface SkillStat {
  skill: string;
  count: number;
  total_usdc: number;
}

export interface Metrics {
  totals: {
    jobs_completed: number;
    total_jobs: number;
    usdc_settled: number;
    avg_settlement_secs: number;
    avg_agents_per_job: number;
    agents_registered: number;
    agents_earning: number;
    bond_slashes: number;
  };
  top_agents: Agent[];
  recent_jobs: Job[];
  daily_stats: DailyStat[];
  skills_distribution: SkillStat[];
  leaderboard: Agent[];
}
