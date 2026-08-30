'use client';

import { useEffect, useState } from 'react';

export type SurfaceMode = 'pointer' | 'touch';

/**
 * Which kind of floating surface this reader should get: an anchored popover
 * (mouse, trackpad) or a bottom sheet (finger).
 *
 * This asks about the INPUT DEVICE, not the screen. Width is the wrong
 * question: a 1280px touchscreen laptop would get a popover it has to poke at,
 * and a 768px iPad with a Magic Keyboard would get a bottom sheet under a
 * trackpad. `(hover: hover) and (pointer: fine)` asks the question we actually
 * mean.
 *
 * It returns `null` — not a guess — until an effect has run. That is what makes
 * it safe here:
 *
 *  - Nothing touches `window` at module scope or during render, so `workerd`
 *    (Cloudflare Workers) never sees a DOM global and no `dynamic(ssr: false)`
 *    wrapper is needed.
 *  - The server and the first client render agree by construction, so there is
 *    no hydration mismatch and no flash of the wrong surface. Callers only read
 *    the value when opening a panel, which cannot happen before hydration.
 *
 * Callers should latch the value at open time rather than reading it live: an
 * iPad that flips `hover`/`pointer` when its trackpad wakes would otherwise
 * unmount an open sheet and remount a popover under the reader's finger.
 */
export function useSurfaceMode(): SurfaceMode | null {
  const [mode, setMode] = useState<SurfaceMode | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      // No matchMedia: assume touch. A bottom sheet is usable with a mouse;
      // a popover anchored on a phone is not.
      setMode('touch');
      return;
    }
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const apply = () => setMode(query.matches ? 'pointer' : 'touch');
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return mode;
}
