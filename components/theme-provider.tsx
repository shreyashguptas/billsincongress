'use client';

import { useEffect } from 'react';
import { ThemeProvider as NextThemesProvider, useTheme, type ThemeProviderProps } from 'next-themes';
import { sharedThemeColor } from '@/app/shared-metadata';

/** The server's own per-scheme colours (paper in each theme), reused, not restated. */
const BROWSER_BAR = {
  light: sharedThemeColor.find((c) => c.media.includes('light'))?.color,
  dark: sharedThemeColor.find((c) => c.media.includes('dark'))?.color,
} as const;

/**
 * Keep the browser's own toolbar (the `theme-color` meta tags) on the theme the
 * reader picked, not on the operating system's. The server renders one tag per
 * OS scheme; a reader who chose Night on a phone set to light got a stone-white
 * browser bar sitting on a black page. Writing the same colour into both tags
 * keeps whichever one the browser is matching correct.
 *
 * Next re-renders the head's metadata on every client-side navigation, which
 * put the OS colour back, so a MutationObserver re-applies the choice whenever
 * the head changes (and only writes when a tag is actually wrong, so its own
 * writes do not loop).
 */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return;
    const color = BROWSER_BAR[resolvedTheme];
    if (!color) return;
    const apply = () => {
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
        if (m.content !== color) m.content = color;
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['content'],
    });
    return () => observer.disconnect();
  }, [resolvedTheme]);
  return null;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}
