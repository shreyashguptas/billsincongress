'use client';

import { useCallback, useRef, useState } from 'react';
import { analytics, type TextLimitSurface } from '@/lib/analytics';
import { limitCount, limitMessage, limitState, limitText } from '@/lib/text-limit';
import { cn } from '@/lib/utils';

/**
 * A text box's length limit, said out loud (see `lib/text-limit.ts`).
 *
 * Run every edit through `limit` instead of setting `maxLength`: a `maxLength`
 * box swallows the extra keystroke or paste without an event, so nothing could
 * tell the reader why their text stopped. Put `nudging` on the element that
 * draws the box's edge as `animate-nudge`, clear it with `onNudgeEnd`, and
 * render `LengthLimitNote` under the box.
 */
export function useLengthLimit(max: number, surface: TextLimitSurface) {
  /** The last edit tried to go past the limit. */
  const [hit, setHit] = useState(false);
  const [nudging, setNudging] = useState(false);
  const reported = useRef(false);

  const limit = useCallback(
    (next: string) => {
      const { value, overflowed } = limitText(next, max);
      setHit(overflowed);
      if (overflowed) {
        // A nudge already under way is not restarted, so a held-down key
        // shakes the box once, not for as long as it is held.
        setNudging(true);
        if (!reported.current) {
          reported.current = true;
          analytics.textLimitReached(surface, max);
        }
      }
      return value;
    },
    [max, surface],
  );

  const onNudgeEnd = useCallback(() => setNudging(false), []);

  return { limit, hit, nudging, onNudgeEnd };
}

/**
 * The line under a limited box: nothing until 90% of the way, then a quiet
 * count, then at the limit the limit in words in the error colour. Always
 * mounted, so a screen reader hears it change (`aria-live`); point the box's
 * `aria-describedby` at `id`.
 *
 * `shownClassName` applies only while there is something to show, for a note
 * that floats over the page (the header search) and needs a surface of its own.
 */
export function LengthLimitNote({
  id,
  length,
  max,
  hit,
  className,
  shownClassName,
}: {
  id: string;
  length: number;
  max: number;
  hit: boolean;
  className?: string;
  shownClassName?: string;
}) {
  const state = hit ? 'full' : limitState(length, max);
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn('text-[13px] leading-5', className, state !== 'quiet' && cn('mt-1.5', shownClassName))}
    >
      {state === 'full' ? (
        <span className="text-error">
          {limitMessage(max)}{' '}
          <span className="font-mono tabular-nums">{limitCount(Math.min(length, max), max)}</span>
        </span>
      ) : state === 'near' ? (
        <span className="font-mono tabular-nums text-ink-3">{limitCount(length, max)}</span>
      ) : null}
    </p>
  );
}
