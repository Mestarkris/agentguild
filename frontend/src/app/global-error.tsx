'use client';

import { useEffect } from 'react';

// global-error.tsx catches errors in the root layout (WalletProvider, Nav, etc.)
// — error.tsx cannot reach those. Must include <html> and <body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error.message, error.stack);
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boundary: 'GlobalError',
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: typeof window !== 'undefined' ? window.location.href : '',
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#08080f', color: '#e2e2e8', fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ maxWidth: 480, width: '100%', padding: '0 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 36, marginBottom: 12 }}>⚠</p>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 13, color: '#9999aa', lineHeight: 1.6, marginBottom: 24 }}>
            {error.message || 'An unexpected error occurred.'}
          </p>
          {error.digest && (
            <p style={{ fontSize: 10, color: '#44445a', marginBottom: 16 }}>Error ID: {error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{ padding: '8px 20px', border: '1px solid rgba(239,159,39,0.4)', borderRadius: 8, background: 'transparent', color: '#ef9f27', fontSize: 13, cursor: 'pointer', fontFamily: 'monospace' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
