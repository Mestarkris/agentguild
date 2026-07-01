import axios from 'axios';
import type { Agent, Job, Metrics } from './types';

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

export async function submitJob(description: string): Promise<{ jobId: string }> {
  const { data } = await api.post('/jobs', { description });
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
