'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getAgent, submitDirectJob } from '@/lib/api';
import type { Agent } from '@/lib/types';
import { useWallet } from '@/lib/wallet';

// Skills whose sole input is audio — don't show text area as primary
const AUDIO_ONLY_SKILLS = new Set(['transcribe']);
// Skills that cannot handle uploaded files meaningfully
const NO_FILE_SKILLS = new Set(['sql', 'chart', 'research']);

const SKILL_EMOJI: Record<string, string> = {
  summarizer: '📝', 'code-review': '🔍', research: '🔬', translate: '🌐',
  sentiment: '💭', sql: '🗃️', chart: '📊', extract: '⛏️',
  'legal-review': '⚖️', finance: '💹', transcribe: '🎙️', 'fact-check': '✅',
};

const AUDIO_EXTS = /\.(mp3|wav|m4a|ogg|flac|aac|opus)$/i;
const AUDIO_MIME = /^audio\//;

function isAudioFile(f: File) {
  return AUDIO_MIME.test(f.type) || AUDIO_EXTS.test(f.name);
}

function truncAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

export default function HirePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { address, balance, connecting, connect, signPaymentAuth } = useWallet();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<'text' | 'file'>('text');
  const [fileWarning, setFileWarning] = useState('');
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAgent(id).then(a => {
      setAgent(a);
      // Transcribe agent defaults to file mode
      if (a.skill === 'transcribe') setInputMode('file');
    }).catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => { setApproved(false); setApproving(false); }, [description, file]);

  if (notFound) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <p className="text-4xl mb-3">🤖</p>
        <p className="text-slate-400">Agent not found</p>
        <Link href="/marketplace" className="text-[#ef9f27] text-sm mt-4 block">← Marketplace</Link>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <div className="w-8 h-8 border-2 border-[rgba(239,159,39,0.2)] border-t-[#ef9f27] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#4a4a55] text-sm font-mono">Loading…</p>
      </div>
    );
  }

  const isAudioAgent = AUDIO_ONLY_SKILLS.has(agent.skill);
  const noFiles = NO_FILE_SKILLS.has(agent.skill);
  const hasInput = inputMode === 'text' ? description.trim().length > 0 : file !== null;
  const estimatedCost = agent.price_usdc.toFixed(6);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setFileWarning('');
    if (!f) return;

    if (isAudioAgent && !isAudioFile(f)) {
      setFileWarning(`TranscribeAgent works with audio files only (.mp3, .wav, .m4a). This looks like a document — switching to ExtractAgent automatically when submitted.`);
    } else if (!isAudioAgent && isAudioFile(f)) {
      setFileWarning(`Audio file detected. It will be routed to TranscribeAgent automatically.`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasInput || !address) return;
    setSubmitting(true);
    setError('');
    try {
      const desc = inputMode === 'text' ? description : (description.trim() || `Process file: ${file!.name}`);
      const { jobId } = await submitDirectJob(id, desc, address, inputMode === 'file' ? file ?? undefined : undefined);
      router.push(`/jobs/${jobId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err as Error)?.message ?? 'Submission failed';
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      {/* Back links */}
      <div className="flex items-center gap-3 mb-6 text-xs font-mono text-[#4a4a55]">
        <Link href="/marketplace" className="hover:text-[#ef9f27] transition-colors">← Marketplace</Link>
        <span>/</span>
        <Link href={`/agents/${id}`} className="hover:text-[#ef9f27] transition-colors">{agent.name}</Link>
        <span>/</span>
        <span className="text-[#6b6b78]">Direct Hire</span>
      </div>

      {/* Agent identity header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-[rgba(239,159,39,0.15)] bg-[#0d0d14] p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{SKILL_EMOJI[agent.skill] ?? '🤖'}</span>
            <div>
              <div className="font-bold text-white">{agent.name}</div>
              <div className="text-xs font-mono text-[#4a4a55] mt-0.5">{agent.skill} · {agent.description}</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold font-mono text-white">${agent.price_usdc}</div>
            <div className="text-[10px] text-[#4a4a55]">per {agent.price_unit}</div>
          </div>
        </div>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-xs font-mono text-[#4a4a55] uppercase tracking-widest">Job Input</h2>

        {/* Mode tabs — only shown when agent supports files */}
        {!noFiles && (
          <div className="flex rounded-lg border border-[rgba(239,159,39,0.12)] overflow-hidden text-xs font-mono">
            {(['text', 'file'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setInputMode(mode)}
                className={`flex-1 py-2 transition-colors ${
                  inputMode === mode
                    ? 'bg-[rgba(239,159,39,0.12)] text-[#ef9f27]'
                    : 'text-[#4a4a55] hover:text-[#6b6b78]'
                }`}
              >
                {mode === 'text' ? '✎ Text description' : '⊞ File upload'}
              </button>
            ))}
          </div>
        )}

        {/* Text input */}
        <AnimatePresence mode="wait">
          {(inputMode === 'text' || noFiles) && (
            <motion.div key="text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={isAudioAgent
                  ? 'Describe the audio content (optional — or just upload a file above)'
                  : `Describe what you need ${agent.name} to do…`
                }
                rows={5}
                className="w-full bg-[#050508] border border-[rgba(239,159,39,0.12)] rounded-xl px-4 py-3 text-sm text-white placeholder-[#3a3a44] focus:outline-none focus:border-[rgba(239,159,39,0.4)] resize-none transition-colors"
              />
            </motion.div>
          )}

          {inputMode === 'file' && !noFiles && (
            <motion.div key="file" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-3">
              {/* File drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                  file
                    ? 'border-[rgba(239,159,39,0.4)] bg-[rgba(239,159,39,0.04)]'
                    : 'border-[rgba(239,159,39,0.12)] hover:border-[rgba(239,159,39,0.3)]'
                }`}
              >
                {file ? (
                  <div>
                    <div className="text-2xl mb-2">{isAudioFile(file) ? '🎙️' : '📄'}</div>
                    <div className="text-sm text-white font-mono">{file.name}</div>
                    <div className="text-xs text-[#6b6b78] mt-1">{(file.size / 1024).toFixed(1)} KB</div>
                    <button type="button" onClick={(ev) => { ev.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="mt-2 text-xs text-[#4a4a55] hover:text-red-400 transition-colors">
                      ✕ Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="text-3xl mb-2">{isAudioAgent ? '🎙️' : '📄'}</div>
                    <div className="text-sm text-[#6b6b78]">
                      {isAudioAgent ? 'Drop audio file here' : 'Drop a file here'}
                    </div>
                    <div className="text-xs text-[#3a3a44] mt-1">
                      {isAudioAgent ? '.mp3, .wav, .m4a, .ogg' : 'Audio routes to Transcribe · Docs stay with this agent'}
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={isAudioAgent ? 'audio/*,.mp3,.wav,.m4a,.ogg,.flac' : '*'}
                  onChange={handleFileChange}
                />
              </div>

              {fileWarning && (
                <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/30 rounded-lg px-3 py-2">
                  ⚠ {fileWarning}
                </p>
              )}

              {/* Optional additional context */}
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Additional instructions (optional) — e.g. 'focus on the financial section' or 'translate to French'"
                rows={2}
                className="w-full bg-[#050508] border border-[rgba(239,159,39,0.08)] rounded-xl px-4 py-3 text-sm text-white placeholder-[#3a3a44] focus:outline-none focus:border-[rgba(239,159,39,0.3)] resize-none transition-colors"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Wallet gate */}
        {!address ? (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-[rgba(239,159,39,0.15)] bg-[#0d0d14]">
            <div className="flex-1">
              <p className="text-sm text-[#a0a0a8]">Connect a wallet to hire this agent</p>
              <p className="text-xs text-[#4a4a55] mt-0.5">Arc Testnet · ${agent.price_usdc} USDC</p>
            </div>
            <button type="button" onClick={connect} disabled={connecting}
              className="px-4 py-2 rounded-lg border border-[rgba(239,159,39,0.4)] text-[#ef9f27] text-sm hover:bg-[rgba(239,159,39,0.08)] disabled:opacity-50 transition-colors">
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Connected wallet row */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#0d0d14] border border-[rgba(239,159,39,0.12)]">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ef9f27]" />
                <span className="text-xs font-mono text-[#ef9f27]">{truncAddr(address)}</span>
              </div>
              {balance && (
                <span className="text-xs font-mono text-[#a0a0a8]">
                  <span className="text-[#ef9f27]">{balance}</span> USDC available
                </span>
              )}
            </div>

            {/* Cost row */}
            <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-[rgba(239,159,39,0.04)] border border-[rgba(239,159,39,0.1)]">
              <span className="text-xs text-[#6b6b78]">Fixed price · {agent.name}</span>
              <span className="text-xs font-mono text-[#ef9f27]">${estimatedCost} USDC → escrow</span>
            </div>

            {/* Approve → Confirm */}
            {!approved ? (
              <button type="button" disabled={!hasInput || approving}
                onClick={async () => {
                  setApproving(true);
                  const jobDesc = description.trim() || `Hire ${agent.name} for ${agent.skill}`;
                  const ok = await signPaymentAuth(estimatedCost, jobDesc);
                  setApproving(false);
                  if (ok) setApproved(true);
                }}
                className="w-full py-3 rounded-xl font-mono text-sm border border-[rgba(239,159,39,0.5)] text-[#ef9f27] hover:bg-[rgba(239,159,39,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {approving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-[rgba(239,159,39,0.3)] border-t-[#ef9f27] rounded-full animate-spin" />
                    Waiting for wallet…
                  </span>
                ) : hasInput
                  ? `Approve $${estimatedCost} USDC & hire ${agent.name} →`
                  : inputMode === 'file' ? 'Upload a file to continue' : 'Describe your job to continue'}
              </button>
            ) : (
              <button type="submit" disabled={submitting}
                className="w-full py-3 rounded-xl font-mono text-sm bg-[#ef9f27] text-black font-bold hover:bg-[#d68f22] disabled:opacity-60 disabled:cursor-not-allowed transition-all">
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Routing to {agent.name}…
                  </span>
                ) : `Confirm · $${estimatedCost} USDC`}
              </button>
            )}
          </div>
        )}
      </form>

      {/* Note: auto-decompose is still available */}
      <p className="text-center text-[10px] font-mono text-[#2a2a33] mt-6">
        Need multiple agents?{' '}
        <Link href="/" className="text-[#3a3a44] hover:text-[#ef9f27] transition-colors">
          Use Submit a Job →
        </Link>
      </p>
    </div>
  );
}
