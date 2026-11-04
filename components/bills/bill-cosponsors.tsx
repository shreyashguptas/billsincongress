'use client';

import Link from 'next/link';
import { useState } from 'react';
import { analytics } from '@/lib/analytics';
import { billsService, type BillPageExtras } from '@/lib/services/bills-service';
import { Button } from '@/components/ui/button';
import { PartyTag } from '@/components/brand/party';
import { SourceLine } from '@/components/brand/section';
import { Term } from '@/components/brand/term';
import type { Platform } from '@/convex/memberAccountsParse';

type Cosponsors = BillPageExtras['cosponsors'];
type Cosponsor = Cosponsors['shown'][number];

const PLATFORM_NAMES: Record<Platform, string> = {
  x: 'X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

function joined(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * The members cosponsoring a bill, as Congress.gov lists them: original
 * cosponsors first, then by the day they joined. Each row carries the
 * member's official accounts, only those their own .gov site confirms
 * (convex/memberAccounts.ts). The page draws the first ten; the rest load
 * when a reader asks, so crawlers never pay for them.
 *
 * Renders nothing until the bill's cosponsors have been read from
 * Congress.gov, so the page never says "none" for a bill it has not checked.
 */
export function BillCosponsors({
  billId,
  noun,
  cosponsors,
}: {
  billId: string;
  noun: string;
  cosponsors: Cosponsors | undefined;
}) {
  const [all, setAll] = useState<Cosponsor[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!cosponsors?.fetched) return null;
  const { total } = cosponsors;
  const rows = all ?? cosponsors.shown;

  const showAll = async () => {
    setLoading(true);
    setFailed(false);
    analytics.billCosponsorsExpanded({ bill_id: billId, total });
    try {
      const result = await billsService.fetchCosponsors(billId);
      if (result) setAll(result.shown);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="bill-cosponsors-title" className="container-editorial pb-16 sm:pb-20">
      <div className="border-t border-line pt-12 sm:pt-16">
        <p className="label-eyebrow">Cosponsors</p>
        <h2 id="bill-cosponsors-title" className="mt-3 font-serif text-display-sm text-ink sm:text-display-lg">
          {/* The verb is the word a reader may not know, so it explains itself. */}
          {total === 0 ? (
            <>
              No other member has <Term id="cosponsor">cosponsored</Term> this {noun}
            </>
          ) : (
            <>
              {total === 1 ? '1 member' : `${total.toLocaleString('en-US')} members`}{' '}
              <Term id="cosponsor">cosponsor{total === 1 ? 's' : ''}</Term> this {noun}
            </>
          )}
        </h2>

        {rows.length > 0 && (
          <ul className="mt-8 grid border-t border-line md:grid-cols-2 md:gap-x-12">
            {rows.map((c) => (
              <li key={c.bioguideId} className="min-w-0 border-b border-line py-4">
                {c.accounts ? (
                  <Link
                    href={`/members/${c.bioguideId}`}
                    className="touch-hit focus-ring inline-flex max-w-full rounded-sm hover:underline"
                    onClick={() =>
                      analytics.memberPageLinkClicked({ bioguide_id: c.bioguideId, from: 'bill_cosponsors', bill_id: billId })
                    }
                  >
                    <PartyTag name={c.name} party={c.party} state={c.state} />
                  </Link>
                ) : (
                  <PartyTag name={c.name} party={c.party} state={c.state} />
                )}
                <p className="mt-1 text-sm text-ink-3">
                  {c.isOriginal ? 'Original cosponsor' : `Joined ${joined(c.sponsorshipDate)}`}
                </p>
                {c.accounts && c.accounts.accounts.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-x-4 text-sm touchable:gap-x-5" aria-label={`${c.name}'s official accounts`}>
                    {c.accounts.accounts.map((a) => (
                      <li key={a.platform}>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${PLATFORM_NAMES[a.platform]} ${a.label} (opens in a new tab)`}
                          // 44px tall on touch; touch-hit widens "X" to 44px, and
                          // the 20px gap keeps it off "Facebook" beside it.
                          className="touch-hit focus-ring inline-flex min-h-8 items-center rounded-xs text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink touchable:min-h-11"
                          onClick={() =>
                            analytics.memberAccountClicked({
                              platform: a.platform,
                              bioguide_id: c.bioguideId,
                              surface: 'bill_cosponsors',
                              bill_id: billId,
                            })
                          }
                        >
                          {PLATFORM_NAMES[a.platform]}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {all === null && total > rows.length && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="outline" className="h-11 sm:h-10" onClick={showAll} disabled={loading}>
              {loading ? 'Loading…' : `Show all ${total.toLocaleString('en-US')} cosponsors`}
            </Button>
            {failed && <p className="text-sm text-ink-2">Could not load the rest. Try again.</p>}
          </div>
        )}

        {total > 0 && (
          <SourceLine className="mt-6">
            Source: Congress.gov · Accounts only where the member&rsquo;s own .gov website links them
          </SourceLine>
        )}
      </div>
    </section>
  );
}
