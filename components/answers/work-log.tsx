'use client';

import { useState } from 'react';

export interface WorkEntry {
  tool: string;
  detail: string;
}

/**
 * The visible grounding trail (spec §7.1). Expanded while the answer is being
 * assembled, collapsed to one line afterwards — the point is to make the extra
 * lookups read as work rather than as dead time.
 */
export function WorkLog({ entries, done }: { entries: WorkEntry[]; done: boolean }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  const label = (e: WorkEntry) =>
    e.tool === 'describe'
      ? `Read the ${e.detail} field guide`
      : e.tool === 'web'
        ? `Searched the web · ${e.detail}`
        : `Searched ${e.detail}`;

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
      {entries.map((e, i) => (
        <p key={i}>✓ {label(e)}</p>
      ))}
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
