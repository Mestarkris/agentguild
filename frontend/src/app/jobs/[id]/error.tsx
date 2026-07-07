'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function JobError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[JobError]', error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      <p className="text-4xl mb-3">⚠</p>
      <h1 className="text-lg font-semibold text-[var(--text-1)] mb-2">Job page error</h1>
      <p className="text-sm text-[var(--text-3)] leading-relaxed mb-6">
        {error.message || 'An unexpected error occurred while loading this job.'}
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg border border-[var(--border-accent-mid)] text-sm text-[var(--accent)] hover:bg-[var(--hover-accent-bg)] transition-colors font-mono"
        >
          Try again
        </button>
        <Link
          href="/jobs"
          className="px-4 py-2 rounded-lg border border-[var(--border-accent-dim)] text-sm text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors font-mono"
        >
          ← All Jobs
        </Link>
      </div>
    </div>
  );
}
