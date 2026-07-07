'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function HireError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // useParams() can return null in some Next.js edge cases when the boundary
  // fires during early hydration — be defensive to avoid cascading failures.
  const params = useParams();
  const id = (params?.id as string | undefined) ?? '';

  useEffect(() => {
    console.error('[HireError]', error.message, error.stack);
    // Report to server so the error appears in Vercel runtime logs.
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boundary: 'HireError',
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== 'undefined' ? window.location.href : '',
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="max-w-xl mx-auto px-6 py-20 text-center">
      <p className="text-4xl mb-3">⚠</p>
      <h1 className="text-lg font-semibold text-[var(--text-1)] mb-2">Hire failed</h1>
      <p className="text-sm text-[var(--text-3)] leading-relaxed mb-6">
        {error.message || 'An unexpected error occurred while processing your request.'}
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg border border-[var(--border-accent-mid)] text-sm text-[var(--accent)] hover:bg-[var(--hover-accent-bg)] transition-colors font-mono"
        >
          Try again
        </button>
        <Link
          href={`/agents/${id}`}
          className="px-4 py-2 rounded-lg border border-[var(--border-accent-dim)] text-sm text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors font-mono"
        >
          ← Agent page
        </Link>
      </div>
    </div>
  );
}
