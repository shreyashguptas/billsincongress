'use client';

import { useEffect } from 'react';
import { ThemeProvider as NextThemesProvider, useTheme, type ThemeProviderProps } from 'next-themes';

/** Paper in each theme (documentation/brand.md, `--paper`). */
const BROWSER_BAR = { light: '#f6f5f1', dark: '#0b0d10' } as const;

/**
 * Keep the browser's own toolbar (the `theme-color` meta tags) on the theme the
 * reader picked, not on the operating system's. The server renders one tag per
 * OS scheme; a reader who chose Night on a phone set to light got a stone-white
 * browser bar sitting on a black page. Writing the same colour into both tags
 * keeps whichever one the browser is matching correct.
 */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return;
    const color = BROWSER_BAR[resolvedTheme];
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.content = color;
    });
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
