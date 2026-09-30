'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { findIconMisalignments } from '@/lib/icon-alignment';

declare global {
  interface Window {
    /** Dev only: re-run the check by hand, e.g. after opening a menu. */
    findIconMisalignments?: typeof findIconMisalignments;
  }
}

/**
 * Development only: after each page settles, warns in the console about any
 * icon that does not line up with the text beside it (lib/icon-alignment.ts,
 * Documentation/brand.md "Icons beside text"). Menus and dialogs open after
 * the check runs; call window.findIconMisalignments() in the console to check
 * them. Renders nothing; the root layout mounts it only in development.
 */
function Check() {
  const pathname = usePathname();

  useEffect(() => {
    window.findIconMisalignments = findIconMisalignments;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await document.fonts.ready;
      // Let client data and entrance animations settle before measuring.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (cancelled) return;
      for (const hit of findIconMisalignments()) {
        const offset = hit.offsetPx === undefined ? '' : ` (${hit.offsetPx}px)`;
        console.warn(`[icon-alignment] ${pathname} ${hit.kind}${offset}: "${hit.label}" — see Documentation/brand.md, "Icons beside text"`, hit.element);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}

// Swapped out at build time outside development, so production ships none of
// the measuring code.
export const IconAlignmentCheck = process.env.NODE_ENV === 'development' ? Check : () => null;
