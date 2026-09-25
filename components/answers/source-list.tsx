'use client';

import Link from 'next/link';
import { printedSources } from '@/lib/answer-format';
import type { WebSource } from '@/lib/answer-format';
import { analytics } from '@/lib/analytics';

/** Re-exported so this component's existing importers keep their import path. */
export type { WebSource };

/** Domain only, so the reader sees who said it. Never blank the answer on a bad URL. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 60);
  }
}

/** Citations are mono 12 in ink-2 (brand.md, "Show the receipts"). */
const SOURCE_LINK =
  'focus-ring rounded-xs text-ink-2 underline decoration-line-strong underline-offset-[3px] ' +
  'transition-colors hover:text-ink hover:decoration-ink';

/**
 * The printed source apparatus (spec §7.2).
 *
 * Two blocks, deliberately distinguished by shape rather than colour: a filled
 * square for our own records, a hollow one for anything that came from the open
 * web. The web block carries the model's own sentence saying what we do not
 * hold — that sentence is the whole point of the separation.
 *
 * The numbers come from `printedSources`, which reads them off the cited
 * `handles` — the same sequence the prose was numbered from. Numbering a block
 * from its own position is what broke this before (D23): a web result cited
 * ahead of a database row left the prose saying [3] beside a row printed 2.
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
  const { db, web } = printedSources(handles, webSources ?? []);
  if (db.length === 0 && web.length === 0) return null;

  return (
    <div className="mt-5 space-y-4 border-t border-line pt-4">
      {db.length > 0 && (
        <div>
          <p className="label-eyebrow !mb-2">
            <span aria-hidden="true">■</span> From our database
          </p>
          <ol className="space-y-1">
            {db.map(({ number, source: s }) => (
              <li key={s.handle} className="flex gap-2.5 font-mono text-xs leading-5">
                <span className="w-4 shrink-0 text-right text-ink-3 tabular">
                  {number}
                </span>
                {s.href ? (
                  <Link
                    href={s.href}
                    onClick={() =>
                      // `position` is the number printed beside the source and
                      // written into the prose, not its row in this block.
                      analytics.answerSourceClicked({
                        surface,
                        source_kind: 'db',
                        position: number,
                      })
                    }
                    className={SOURCE_LINK}
                  >
                    {s.label}
                  </Link>
                ) : (
                  <span className="text-ink-3">{s.label}</span>
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
            <p className="mb-2 text-sm leading-relaxed text-ink-2">
              {webReason} So this came from the web:
            </p>
          )}
          <ol className="space-y-1">
            {web.map(({ number, handle, web: s }, i) => (
              <li key={`${handle}:${i}`} className="flex gap-2.5 font-mono text-xs leading-5">
                <span className="w-4 shrink-0 text-right text-ink-3 tabular">
                  {/* No number for a result the answer never cited: nothing in
                      the prose points here, and a number would imply it does. */}
                  {number ?? <span aria-hidden="true">·</span>}
                </span>
                {s ? (
                  <a
                    href={s.url}
                    target="_blank"
                    // nofollow as well as noopener/noreferrer: we do not want to
                    // pass ranking signal to arbitrary pages the model surfaced.
                    rel="noopener noreferrer nofollow"
                    onClick={() =>
                      // 0 marks a listed-but-uncited result, so the funnel can
                      // tell a followed citation from idle curiosity.
                      analytics.answerSourceClicked({
                        surface,
                        source_kind: 'web',
                        position: number ?? 0,
                      })
                    }
                    className={SOURCE_LINK}
                  >
                    {s.title || hostOf(s.url)}
                    <span className="text-ink-3">
                      {' · '}
                      {hostOf(s.url)}
                      <span aria-hidden="true"> ↗</span>
                    </span>
                  </a>
                ) : (
                  // Cited, but the result detail did not survive into this turn.
                  // Printed anyway: a number in the prose with no row under it
                  // is worse than a row that only says a web page was used.
                  <span className="text-ink-3">A web page (link not stored)</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
