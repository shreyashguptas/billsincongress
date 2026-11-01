'use client';

import { useEffect, useMemo, useState } from 'react';
import { heldCount, revealCount, revealElapsedFor, revealStops, revealedText } from '@/lib/answer-reveal';

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
 *
 * `holdAt` pauses the reveal at that offset (the start of a list whose bills
 * cannot be judged until the answer's sources arrive). Its clock is pinned
 * there while held, so when it is let go it carries on from that word at the
 * usual pace, rather than dropping everything it would have shown meanwhile
 * into one frame. A held reveal is never `complete`.
 */
export function useAnswerReveal(
  id: string,
  text: string,
  done: boolean,
  onRevealing?: (id: string, active: boolean) => void,
  holdAt: number | null = null,
) {
  const [live] = useState(() => {
    if (prefersReducedMotion()) return false;
    const entry = reveals.get(id);
    return entry ? !entry.finished : !done;
  });
  const stops = useMemo(() => revealStops(text), [text]);
  const hold = holdAt === null ? null : heldCount(stops, holdAt);
  // A remount picks up at the elapsed position rather than painting one empty
  // frame and then everything at once.
  const [settled] = useState(() => {
    const entry = reveals.get(id);
    if (!live || !entry) return 0;
    const n = revealCount(stops.length, performance.now() - entry.start);
    return hold === null ? n : Math.min(n, hold);
  });
  const [count, setCount] = useState(settled);

  useEffect(() => {
    if (!live || stops.length === 0) return;
    const entry = reveals.get(id) ?? { start: performance.now(), finished: false };
    reveals.set(id, entry);
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      let n = revealCount(stops.length, now - entry.start);
      if (hold !== null && n > hold) {
        // Held: pin the clock at the hold, so letting go resumes from here.
        n = hold;
        entry.start = now - revealElapsedFor(stops.length, hold);
      }
      setCount(n);
      if (n < stops.length) frame = requestAnimationFrame(tick);
      else if (done) entry.finished = true;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id, live, stops, done, hold]);

  const complete = hold === null && (!live || count >= stops.length);

  useEffect(() => {
    if (!onRevealing) return;
    onRevealing(id, !complete);
    return () => onRevealing(id, false);
  }, [id, complete, onRevealing]);

  // Not paced (reduced motion): still nothing past the hold, so a list never
  // shows as bullets before its sources say whether it is cards.
  if (!live) {
    return { visible: holdAt === null ? text : text.slice(0, holdAt), live, settledBefore: 0, complete };
  }
  return {
    visible: revealedText(text, stops, count),
    live,
    settledBefore: settled > 0 ? (stops[settled - 1] ?? text.length) : 0,
    complete,
  };
}
