'use client';

import { useState } from 'react';

export interface WorkEntry {
  tool: string;
  detail: string;
}

/**
 * The exact sentence `workLogLabel` in convex/catalog/completeness.ts emits
 * when a search read only part of its set. Matched as a whole string rather
 * than parsed: if that wording ever changes, the line degrades to printing the
 * detail verbatim, which is still true. work-log.test.ts imports the real
 * function and fails if the two drift apart.
 */
const NO_COUNT = 'partial results — no count available';

/** One rendered trail line: prose plus an optional quieter trailing clause. */
export interface WorkLine {
  text: string;
  /**
   * Rendered in brackets, in the same ink as the rest of the line. The brackets
   * alone carry the "footnote" weight, and they have to: --muted-foreground is
   * already only 5.26:1 against --background (the panel's own surface), so any
   * opacity below ~0.9 puts this under the 4.5:1 WCAG AA floor for 11px text —
   * at 70% it measures 2.62:1, worse even than the 3:1 large-text floor. There
   * is no dimming budget left, and the caveat that we have no audited number is
   * the last string in this trail that should be hard to read.
   */
  aside?: string;
}

/**
 * Turn a work entry into the words the reader sees.
 *
 * The reason this is not a one-line template any more: the trail used to print
 * "Searched sponsors · 29 matches" for a search that had examined a fraction of
 * the set. 29 was a real number in a real variable, so it read as audited — and
 * the California answer built on it was wrong (the true figure was 54). A
 * partial search now says it was partial and offers no number at all.
 */
export function workLine(e: WorkEntry): WorkLine {
  if (e.tool === 'describe') return { text: `Read the ${e.detail} field guide` };
  if (e.tool === 'web') return { text: `Searched the web · ${e.detail}` };
  // The assistant stopping to ask the reader something is not a lookup, and
  // labelling it "Searched ..." would describe work that never happened.
  if (e.tool === 'ask') return { text: `Asked you a question · ${e.detail}` };
  if (!e.detail.includes(NO_COUNT)) return { text: `Searched ${e.detail}` };
  // "partial results" is the honest, unalarming half; the missing count is a
  // footnote, not a failure — partial reads are a normal way to answer.
  return {
    text: `Searched ${e.detail.replace(NO_COUNT, 'partial results')}`,
    aside: 'no count available',
  };
}

/**
 * The visible grounding trail (spec §7.1). Expanded while the answer is being
 * assembled, collapsed to one line afterwards — the point is to make the extra
 * lookups read as work rather than as dead time.
 */
export function WorkLog({ entries, done }: { entries: WorkEntry[]; done: boolean }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  if (done && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        ✓ {entries.length} lookup{entries.length === 1 ? '' : 's'} · show
      </button>
    );
  }

  return (
    <div className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
      {entries.map((e, i) => {
        const line = workLine(e);
        return (
          <p key={i}>
            ✓ {line.text}
            {line.aside && ` (${line.aside})`}
          </p>
        );
      })}
      {!done && <p className="animate-pulse">· Writing answer…</p>}
      {done && open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="hover:text-foreground transition-colors"
        >
          hide
        </button>
      )}
    </div>
  );
}
