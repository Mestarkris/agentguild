import axios from 'axios';
import type { Agent, Job, Metrics, Transaction } from './types';

const api = axios.create({ baseURL: '/api' });

export async function getAgents(): Promise<Agent[]> {
  const { data } = await api.get('/agents');
  return data;
}

export async function getJob(id: string): Promise<Job> {
  const { data } = await api.get(`/jobs/${id}`);
  return data;
}

export async function getJobs(): Promise<Job[]> {
  const { data } = await api.get('/jobs');
  return data;
}

export async function submitJob(description: string, payerAddress?: string): Promise<{ jobId: string }> {
  const body: Record<string, string> = { description };
  if (payerAddress) body.payer_address = payerAddress;
  const { data } = await api.post('/jobs', body);
  return { jobId: data.jobId };
}

export async function flagJob(jobId: string, agentId: string, reason: string) {
  const { data } = await api.post(`/jobs/${jobId}/flag`, { agent_id: agentId, reason });
  return data;
}

export async function getMetrics(): Promise<Metrics> {
  const { data } = await api.get('/metrics');
  return data;
}

export async function getTransactions(params?: { agent_id?: string; job_id?: string; limit?: number }) {
  const { data } = await api.get('/transactions', { params });
  return data as Transaction[];
}

export async function getAgent(id: string): Promise<Agent> {
  const { data } = await api.get(`/agents/${id}`);
  return data;
}

export async function submitDirectJob(
  agentId: string,
  description: string,
  payerAddress?: string,
  file?: File
): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append('agentId', agentId);
  form.append('description', description);
  if (payerAddress) form.append('payer_address', payerAddress);
  if (file) form.append('file', file);
  const { data } = await api.post('/jobs/direct', form);
  return { jobId: data.jobId };
}
