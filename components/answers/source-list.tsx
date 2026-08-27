'use client';

import Link from 'next/link';
import { toSources } from '@/lib/answer-format';
import { analytics } from '@/lib/analytics';

export interface WebSource {
  handle: string;
  url: string;
  excerpt: string;
}

/** Domain only, so the reader sees who said it. Never blank the answer on a bad URL. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 60);
  }
}

/**
 * The printed source apparatus (spec §7.2).
 *
 * Two blocks, deliberately distinguished by shape rather than colour: a filled
 * square for our own records, a hollow one for anything that came from the open
 * web. The web block carries the model's own sentence saying what we do not
 * hold — that sentence is the whole point of the separation.
 */
export function SourceList({
  handles,
  surface,
  webReason,
  webSources,
}: {
  handles: string[];
  surface: string;
  webReason?: string;
  webSources?: WebSource[];
}) {
  const db = toSources(handles).filter((s) => s.kind === 'db');
  const web = webSources ?? [];
  if (db.length === 0 && web.length === 0) return null;

  return (
    <div className="mt-4 border-t border-border pt-3 space-y-3">
      {db.length > 0 && (
        <div>
          <p className="label-eyebrow !mb-2">
            <span aria-hidden="true">■</span> From our database
          </p>
          <ol className="space-y-1">
            {db.map((s, i) => (
              <li key={s.handle} className="flex gap-2 text-sm">
                <span className="font-mono text-[11px] text-muted-foreground tabular pt-0.5">
                  {i + 1}
                </span>
                {s.href ? (
                  <Link
                    href={s.href}
                    onClick={() =>
                      analytics.answerSourceClicked({
                        surface,
                        source_kind: 'db',
                        position: i + 1,
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
          {webReason && (
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              {webReason} So this came from the web:
            </p>
          )}
          <ol className="space-y-1">
            {web.map((s, i) => (
              <li key={s.handle} className="flex gap-2 text-sm">
                <span className="font-mono text-[11px] text-muted-foreground tabular pt-0.5">
                  {i + 1}
                </span>
                <a
                  href={s.url}
                  target="_blank"
                  // nofollow as well as noopener/noreferrer: we do not want to
                  // pass ranking signal to arbitrary pages the model surfaced.
                  rel="noopener noreferrer nofollow"
                  onClick={() =>
                    analytics.answerSourceClicked({
                      surface,
                      source_kind: 'web',
                      position: i + 1,
                    })
                  }
                  className="text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground"
                >
                  {hostOf(s.url)}
                  <span className="text-muted-foreground" aria-hidden="true">
                    {' '}
                    ↗
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
