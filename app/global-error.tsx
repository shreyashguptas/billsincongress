'use client';

import { useChunkErrorRecovery } from '@/lib/use-chunk-error-recovery';

// Root boundary for errors thrown by the root layout itself. It replaces the
// whole document, so it must render its own <html>/<body> and cannot rely on
// the app's stylesheet being present — hence the inline styles. Like
// `app/error.tsx` it auto-recovers from a chunk failure with one guarded reload
// and shows a retry control as the fallback.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkError = useChunkErrorRecovery(error);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '32rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 0.75rem' }}>
            {chunkError ? 'A new version is available' : 'Something went wrong'}
          </h1>
          <p style={{ margin: '0 0 1.5rem', color: '#555', lineHeight: 1.5 }}>
            {chunkError
              ? 'The site updated since you opened this page. Reload to load the latest version.'
              : 'An unexpected error interrupted this page. Try again, or head back home.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => (chunkError ? window.location.reload() : reset())}
              style={{
                cursor: 'pointer',
                borderRadius: '0.25rem',
                border: 'none',
                background: '#111',
                color: '#fff',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              {chunkError ? 'Reload page' : 'Try again'}
            </button>
            <a
              href="/"
              style={{
                borderRadius: '0.25rem',
                border: '1px solid #ccc',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
