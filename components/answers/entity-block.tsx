'use client';

import Link from 'next/link';
import { analytics } from '@/lib/analytics';
import { CompactBillCard } from '@/components/bills/bill-card';
import type { AnswerBlock } from '@/lib/answer-entities';

/** The per-bill display projection the server echoes back on `done`. */
export type EntityDisplay = Record<string, Record<string, unknown>>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/**
 * Renders a resolved entity directive (spec §6.6). Bills reuse the site's own
 * card at compact density; everything else is a chip that links into an
 * existing filtered view.
 *
 * Titles come from the display projection the answer already carries, never
 * from a per-card fetch — a request storm behind every answer is exactly what
 * this design is avoiding. A bill with no projection still renders, id-only.
 */
export function EntityBlock({
  block,
  surface,
  entities,
}: {
  block: Extract<AnswerBlock, { type: 'entities' }>;
  surface: string;
  entities?: EntityDisplay;
}) {
  const track = (position: number, id: string) =>
    analytics.answerEntityClicked({
      surface,
      entity_kind: block.kind,
      position,
      entity_id: id,
    });

  if (block.kind === 'bill') {
    return (
      // font-sans resets the answer prose around it: the card sets its own type.
      <div className="my-4 space-y-2 font-sans text-base">
        {block.refs.map((ref, i) => {
          const d = entities?.[`bills:${ref.id}`];
          const sponsor = str(d?.sponsor);
          return (
            <CompactBillCard
              key={ref.id}
              href={ref.href}
              label={str(d?.label) ?? ref.id}
              title={str(d?.title)}
              sponsorLastName={sponsor ? sponsor.split(' ').slice(-1)[0] : undefined}
              sponsorParty={str(d?.sponsorParty)}
              stage={typeof d?.progressStage === 'number' ? d.progressStage : undefined}
              onClick={() => track(i + 1, ref.id)}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="my-4 flex flex-wrap gap-2 font-sans">
      {block.refs.map((ref, i) => (
        <Link
          key={ref.id}
          href={ref.href}
          onClick={() => track(i + 1, ref.id)}
          className="focus-ring inline-flex h-8 items-center rounded-sm border border-line-strong bg-raised px-2.5 font-mono text-xs text-ink transition-colors hover:bg-sunken"
        >
          {ref.id}
        </Link>
      ))}
    </div>
  );
}
