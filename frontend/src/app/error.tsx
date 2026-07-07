'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="text-4xl">⚠</p>
        <h1 className="text-lg font-semibold text-[var(--text-1)]">Something went wrong</h1>
        <p className="text-sm text-[var(--text-3)] leading-relaxed">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg border border-[var(--border-accent-mid)] text-sm text-[var(--accent)] hover:bg-[var(--hover-accent-bg)] transition-colors font-mono"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 rounded-lg border border-[var(--border-accent-dim)] text-sm text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors font-mono"
          >
            ← Home
          </Link>
        </div>
        {error.digest && (
          <p className="text-[10px] font-mono text-[var(--text-6)]">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
