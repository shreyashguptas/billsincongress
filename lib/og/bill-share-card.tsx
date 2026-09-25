import type { ReactElement } from 'react';
import type { Bill } from '@/lib/types/bill';
import { CardFrame, StageHeadline, StageTrack } from './card-parts';

export { shareCardFonts, stageNote as shareCardStageNote } from './card-parts';

/**
 * The picture a bill's link unfurls into — in iMessage, WhatsApp, Slack, email
 * clients, X and anywhere else that reads Open Graph (Documentation/brand.md,
 * "Share card").
 *
 * It shows one thing: where the bill stands. Every app that shows the picture
 * prints the page's title under it ("S.Res. 873 — In committee: A resolution
 * requesting…") and the domain, so the card does not repeat the number, the
 * title, the sponsor or the address. What text cannot do at a glance is the
 * stage, drawn: its glyph, its name in display type, "Stage n of 7", and the
 * seven-step track with every step named.
 */
export function BillShareCard({ bill }: { bill: Bill }): ReactElement {
  const stage =
    typeof bill.progress_stage === 'string'
      ? parseInt(bill.progress_stage, 10)
      : bill.progress_stage;

  return (
    <CardFrame>
      {/* The headline centred in the room the track leaves. */}
      <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center' }}>
        <StageHeadline stage={stage} />
      </div>
      <StageTrack stage={stage} />
    </CardFrame>
  );
}
