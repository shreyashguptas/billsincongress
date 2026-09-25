'use client';

import './globals.css';

import { useEffect, useState } from 'react';
import { Geist, Geist_Mono, Newsreader } from 'next/font/google';

import { ChamberMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { useChunkErrorRecovery } from '@/lib/use-chunk-error-recovery';

// The same three faces as app/layout.tsx, declared again because this file
// replaces the root layout and inherits none of it.
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-serif', display: 'swap', axes: ['opsz'] });
const geist = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

/**
 * The theme the rest of the site would have shown: next-themes keeps the
 * reader's choice under `theme` ('light' | 'dark' | 'system'), and 'system' or
 * nothing follows the OS. Read after mount, since the server cannot know it.
 */
function useStoredTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem('theme');
    } catch {
      // Storage blocked: fall through to the OS preference.
    }
    const dark =
      stored === 'dark' ||
      (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setTheme(dark ? 'dark' : 'light');
  }, []);
  return theme;
}

// Root boundary for errors thrown by the root layout itself. It replaces the
// whole document, so it renders its own <html>/<body> and brings its own
// stylesheet and fonts (Next.js does not carry the root layout's over). Like
// `app/error.tsx` it auto-recovers from a chunk failure with one guarded reload
// and shows a retry control as the fallback. The "Go home" link is a plain <a>:
// with the layout broken, a full page load is the reliable way back.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkError = useChunkErrorRecovery(error);
  const theme = useStoredTheme();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${geist.variable} ${geistMono.variable}${theme === 'dark' ? ' dark' : ''}`}
    >
      <body className="flex min-h-screen items-center justify-center bg-paper px-4 py-16 font-sans text-ink antialiased">
        <main className="flex max-w-lg flex-col items-center text-center">
          <ChamberMark className="h-12 w-12 text-ink-3" />
          <p className="mt-6 font-mono text-xs leading-4 text-ink-3">
            {chunkError ? 'Update needed' : 'Error'}
          </p>
          <h1 className="mt-3 text-display-md text-ink">
            {chunkError ? 'A new version is available' : 'Something went wrong'}
          </h1>
          <p className="mt-4 max-w-[48ch] text-[17px] leading-relaxed text-ink-2">
            {chunkError
              ? 'The site updated since you opened this page. Reload to load the latest version.'
              : 'An unexpected error interrupted this page. Try again, or head back home.'}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button type="button" onClick={() => (chunkError ? window.location.reload() : reset())}>
              {chunkError ? 'Reload page' : 'Try again'}
            </Button>
            <Button asChild variant="outline">
              <a href="/">Go home</a>
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
