'use client';

import Link from 'next/link';
import { analytics } from '@/lib/analytics';
import { stageFill } from '@/components/brand/status';
import { ALL_HUBS, topicSlug, type HubDefinition } from '@/lib/hubs';
import { measureStageLabel } from '@/lib/utils/bill-stages';
import type { BillPageExtras } from '@/lib/services/bills-service';

type RelatedBill = BillPageExtras['related'][number];

/**
 * "More on this topic": up to five bills on the same topic in the same
 * Congress, most recently acted on, then the hub pages this bill belongs to
 * (documentation/brand.md, "Related bills").
 *
 * Bill pages used to link only to the site's navigation, so search engines
 * found ~56,800 of them almost only through the sitemap. These links are
 * plain anchors in the server-rendered HTML, so a crawler that reaches any
 * bill reaches its neighbours and its topic, stage and chamber pages.
 */
export function BillRelatedSection({
  billId,
  billType,
  stage,
  policyArea,
  related,
}: {
  billId: string;
  billType: string;
  stage: number;
  policyArea: string | null;
  related: RelatedBill[];
}) {
  const hubs = billHubs({ billType, stage, policyArea });
  if (related.length === 0 && hubs.length === 0) return null;
  const fromPath = `/bills/${billId}`;

  return (
    <section aria-labelledby="bill-related-title" className="container-editorial pb-16 sm:pb-20">
      <div className="border-t border-line pt-12 sm:pt-16">
        <p className="label-eyebrow">Keep reading</p>
        <h2 id="bill-related-title" className="mt-3 font-serif text-display-sm text-ink sm:text-display-lg">
          {policyArea && related.length > 0 ? `More ${policyArea} bills` : 'Where this bill sits'}
        </h2>

        {related.length > 0 && (
          <ul className="mt-8 border-t border-line">
            {related.map((r, i) => (
              <li key={r.billId} className="border-b border-line">
                <Link
                  href={`/bills/${r.billId}`}
                  onClick={() =>
                    analytics.relatedBillClicked({
                      from_bill_id: billId,
                      to_bill_id: r.billId,
                      policy_area: policyArea ?? '',
                      position: i + 1,
                    })
                  }
                  className="focus-ring group flex gap-4 rounded-sm py-4 sm:items-baseline"
                >
                  <span className="w-24 shrink-0 font-mono text-[13px] text-ink-2 tabular">
                    {r.billTypeLabel} {r.billNumber}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ink group-hover:underline">{r.title}</span>
                    {r.progressStage !== null && (
                      <span className="mt-1 flex items-center gap-2 text-sm text-ink-3">
                        <span
                          aria-hidden="true"
                          className={`h-2 w-2 shrink-0 rounded-full ${stageFill(r.progressStage)}`}
                        />
                        {measureStageLabel(r.progressStage, r.billType)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {hubs.length > 0 && (
          <nav aria-label="Pages this bill belongs to" className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {hubs.map((hub) => (
              <Link
                key={hub.path}
                href={hub.path}
                onClick={() =>
                  analytics.hubLinkClicked({
                    from_path: fromPath,
                    to_path: hub.path,
                    hub_kind: hub.kind,
                    placement: 'bill_page',
                  })
                }
                className="focus-ring rounded-sm text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              >
                {hubLinkLabel(hub)} →
              </Link>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}

/** The topic, stage and chamber pages a bill appears on, in that order. */
export function billHubs({
  billType,
  stage,
  policyArea,
}: {
  billType: string;
  stage: number;
  policyArea: string | null;
}): HubDefinition[] {
  const chamber = billType.toLowerCase().startsWith('s') ? 'senate' : 'house';
  const topicPath = policyArea ? `/bills/topic/${topicSlug(policyArea)}` : null;
  return [
    ALL_HUBS.find((h) => h.kind === 'topic' && h.path === topicPath),
    ALL_HUBS.find((h) => h.kind === 'status' && h.filter.progressStage === String(stage)),
    ALL_HUBS.find((h) => h.kind === 'chamber' && h.filter.chamber === chamber),
  ].filter((h): h is HubDefinition => Boolean(h));
}

/** "All Health bills", "All House bills"; a stage hub's heading already reads as a link. */
function hubLinkLabel(hub: HubDefinition): string {
  return hub.kind === 'status' ? hub.heading : `All ${hub.heading}`;
}
