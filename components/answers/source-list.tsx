'use client';

import Link from 'next/link';
import { toSources } from '@/lib/answer-format';
import { analytics } from '@/lib/analytics';

/**
 * The printed source apparatus (spec §7.2). Database sources are marked with a
 * filled square and web sources with a hollow one, so the distinction survives
 * without relying on colour.
 */
export function SourceList({ handles, surface }: { handles: string[]; surface: string }) {
  if (handles.length === 0) return null;
  const sources = toSources(handles);
  const db = sources.filter((s) => s.kind === 'db');
  const web = sources.filter((s) => s.kind === 'web');

  return (
    <div className="mt-4 border-t border-border pt-3 space-y-3">
      {db.length > 0 && (
        <div>
          <p className="label-eyebrow !mb-2">
            <span aria-hidden="true">■</span> From our database
          </p>
          <ol className="space-y-1">
            {db.map((s) => (
              <li key={s.handle} className="flex gap-2 text-sm">
                <span className="font-mono text-[11px] text-muted-foreground tabular pt-0.5">
                  {sources.indexOf(s) + 1}
                </span>
                {s.href ? (
                  <Link
                    href={s.href}
                    onClick={() =>
                      analytics.answerSourceClicked({
                        surface,
                        source_kind: 'db',
                        position: sources.indexOf(s) + 1,
                      })
                    }
                    className="text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground"
                  >
                    {s.label}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{s.label}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {web.length > 0 && (
        <div>
          <p className="label-eyebrow !mb-2">
            <span aria-hidden="true">□</span> Not from our database
          </p>
          <ol className="space-y-1">
            {web.map((s) => (
              <li key={s.handle} className="flex gap-2 text-sm">
                <span className="font-mono text-[11px] text-muted-foreground tabular pt-0.5">
                  {sources.indexOf(s) + 1}
                </span>
                {s.href ? (
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    onClick={() =>
                      analytics.answerSourceClicked({
                        surface,
                        source_kind: 'web',
                        position: sources.indexOf(s) + 1,
                      })
                    }
                    className="text-muted-foreground underline underline-offset-2 decoration-border hover:text-foreground hover:decoration-foreground"
                  >
                    {s.label}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{s.label}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
