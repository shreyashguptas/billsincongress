'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn, formatCount } from '@/lib/utils';
import { analytics } from '@/lib/analytics';
import { stageFill } from '@/components/brand/status';
import { SourceLine } from '@/components/brand/section';
import { stageLabel, BillStages } from '@/lib/utils/bill-stages';
import { formatDay, formatShare, peerGroups, peerHeadline } from '@/lib/bill-journey';

export type BillPeers = {
  policyArea: string;
  total: number;
  stageCounts: Array<{ stage: number; count: number }>;
  countedAt: string;
};

/**
 * Every bill on this bill's topic in its Congress, one dot each, coloured by
 * stage, with this bill ringed (Documentation/brand.md, "Peer dots").
 *
 * The counts come from the nightly topic recount, which reads the whole
 * Congress. The ring is a claim that this bill is one of the dots in its
 * group, so it is drawn only when the bill has not changed since that count:
 * a bill that moved today may still be counted where it was.
 */
export function BillPeersSection({
  billId,
  billLabel,
  billStage,
  billUpdatedAt,
  congress,
  peers,
  today,
}: {
  billId: string;
  billLabel: string;
  billStage: number;
  billUpdatedAt?: string;
  congress: number;
  peers: BillPeers;
  today: string;
}) {
  const groups = useMemo(() => peerGroups(peers.stageCounts), [peers.stageCounts]);
  const lawCount = groups.find((g) => g.stage === BillStages.BECAME_LAW)?.count ?? 0;
  const ringed =
    Boolean(billUpdatedAt) &&
    billUpdatedAt! <= peers.countedAt &&
    groups.some((g) => g.stage === billStage);
  const headline = peerHeadline({
    topic: peers.policyArea,
    total: peers.total,
    lawCount,
    billIsLaw: billStage === BillStages.BECAME_LAW,
    congress,
    today,
  });

  // A legend row being hovered or focused: its dots stay, the rest drop to 35%.
  const [active, setActive] = useState<number | null>(null);

  // Below the fold, so "viewed" means scrolled to, not rendered.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          analytics.billPeersViewed({
            bill_id: billId,
            policy_area: peers.policyArea,
            peer_total: peers.total,
            law_count: lawCount,
            ring_shown: ringed,
          });
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId]);

  const summary =
    groups.map((g) => `${formatCount(g.count)} ${stageLabel(g.stage).toLowerCase()}`).join(', ') +
    (ringed ? `. ${billLabel} is ringed among the ${stageLabel(billStage).toLowerCase()}.` : '.');

  return (
    <section ref={ref} aria-labelledby="bill-peers-title" className="container-editorial pb-16 sm:pb-20">
      <div className="border-t border-line pt-12 sm:pt-16">
        <p className="label-eyebrow">Among its peers</p>
        <h2
          id="bill-peers-title"
          className="mt-3 max-w-[30ch] font-serif text-display-sm text-ink sm:text-display-lg"
        >
          {headline}
        </h2>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
          <div
            role="img"
            aria-label={`${formatCount(peers.total)} ${peers.policyArea} bills and resolutions, one dot each: ${summary}`}
            className="flex flex-wrap content-start gap-[2px] sm:gap-[3px]"
          >
            {groups.map((g) =>
              Array.from({ length: g.count }, (_, i) => {
                const isThisBill = ringed && g.stage === billStage && i === 0;
                return (
                  <span
                    key={`${g.stage}-${i}`}
                    aria-hidden="true"
                    className={cn(
                      'block h-[5px] w-[5px] rounded-full transition-opacity sm:h-[7px] sm:w-[7px]',
                      stageFill(g.stage),
                      active !== null && active !== g.stage && 'opacity-35',
                      isThisBill && 'ring-2 ring-ink ring-offset-2 ring-offset-paper',
                    )}
                  />
                );
              }),
            )}
          </div>

          <div>
            <ul aria-label="Legend">
              {groups.map((g) => (
                <li
                  key={g.stage}
                  tabIndex={0}
                  onMouseEnter={() => setActive(g.stage)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(g.stage)}
                  onBlur={() => setActive(null)}
                  className="focus-ring flex h-12 items-center gap-2.5 rounded-sm border-b border-line text-sm"
                >
                  <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full', stageFill(g.stage))} />
                  <span className="flex-1 text-ink-2">{stageLabel(g.stage)}</span>
                  <span className="font-mono text-xs text-ink-3 tabular">{formatShare(g.count, peers.total)}</span>
                  <span className="w-14 text-right font-mono text-[13px] text-ink tabular">{formatCount(g.count)}</span>
                </li>
              ))}
            </ul>
            {ringed && (
              <p className="mt-4 flex items-center gap-2.5 text-sm text-ink-2">
                <span
                  aria-hidden="true"
                  className={cn('h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-ink ring-offset-2 ring-offset-paper', stageFill(billStage))}
                />
                {billLabel}, this one
              </p>
            )}
          </div>
        </div>

        <SourceLine className="mt-6">
          Each dot is one bill or resolution · Source: Congress.gov · Counted {formatDay(peers.countedAt)}
        </SourceLine>
      </div>
    </section>
  );
}
