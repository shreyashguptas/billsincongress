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
 * Returns:
 * - `live`: the prose should carry per-word fade spans;
 * - `settledBefore`: the offset in `text` before which words were already on
 *   screen when this component mounted, so they must not fade in again;
 * - `complete`: the whole text is on screen, which is what the sources wait for.
 *
 * `onRevealing` hears whether the reveal is still writing, so the thread can
 * follow growth only while something is actually being written.
 */
export function useAnswerReveal(
  id: string,
  text: string,
  done: boolean,
  onRevealing?: (id: string, active: boolean) => void,
) {
  const [live] = useState(() => {
    if (prefersReducedMotion()) return false;
    const entry = reveals.get(id);
    return entry ? !entry.finished : !done;
  });
  const stops = useMemo(() => revealStops(text), [text]);
  // A remount picks up at the elapsed position rather than painting one empty
  // frame and then everything at once.
  const [settled] = useState(() => {
    const entry = reveals.get(id);
    return live && entry ? revealCount(stops.length, performance.now() - entry.start) : 0;
  });
  const [count, setCount] = useState(settled);

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

  const complete = !live || count >= stops.length;

  useEffect(() => {
    if (!onRevealing) return;
    onRevealing(id, !complete);
    return () => onRevealing(id, false);
  }, [id, complete, onRevealing]);

  if (!live) return { visible: text, live, settledBefore: 0, complete };
  return {
    visible: revealedText(text, stops, count),
    live,
    settledBefore: settled > 0 ? (stops[settled - 1] ?? text.length) : 0,
    complete,
  };
}
