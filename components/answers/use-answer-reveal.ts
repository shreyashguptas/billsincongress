'use client';

import { useEffect, useMemo, useState } from 'react';
import { revealCount, revealStops, revealedText } from '@/lib/answer-reveal';

/**
 * When each live answer's reveal began, by turn id. Module-level so a turn that
 * remounts mid-reveal — the switch from an answer to "One question first" when
 * `done` reports `askedReader` — carries on where it was instead of starting
 * over, and one that already finished does not play again.
 */
const reveals = new Map<string, { start: number; finished: boolean }>();

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Pace an answer onto the page word by word (lib/answer-reveal.ts).
 *
 * Only a turn that was still being written when it mounted is revealed. A
 * resumed conversation, or any answer under `prefers-reduced-motion`, shows in
 * full at once.
 *
 * `live` is whether the prose should carry per-word fade spans; `complete` is
 * whether the whole text is on screen, which is what the source list waits for.
 */
export function useAnswerReveal(id: string, text: string, done: boolean) {
  const [live] = useState(() => {
    if (prefersReducedMotion()) return false;
    const entry = reveals.get(id);
    return entry ? !entry.finished : !done;
  });
  const stops = useMemo(() => revealStops(text), [text]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!live || stops.length === 0) return;
    const entry = reveals.get(id) ?? { start: performance.now(), finished: false };
    reveals.set(id, entry);
    const { start } = entry;
    let frame = 0;
    const tick = () => {
      const n = revealCount(stops.length, performance.now() - start);
      setCount(n);
      if (n < stops.length) frame = requestAnimationFrame(tick);
      else if (done) entry.finished = true;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id, live, stops, done]);

  if (!live) return { visible: text, live, complete: true };
  return {
    visible: revealedText(text, stops, count),
    live,
    complete: count >= stops.length,
  };
}
