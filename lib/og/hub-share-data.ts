import { billsService } from '@/lib/services/bills-service';
import { getConvexHttpClient } from '@/lib/convex-client';
import { POLICY_AREAS } from '@/lib/constants/filters';
import type { HubDefinition } from '@/lib/hubs';
import type { HubCardData } from './hub-share-card';

/**
 * The figures behind a page's share card, for the current Congress — the one
 * the page itself counts.
 *
 * Only complete reads (AGENTS.md, "Answer accuracy"; convex/catalog/
 * completeness.ts). A `listCount` answer with `exact: false` is a floor, not a
 * total, so it is never used. The headline figure is required: without it the
 * whole card is refused (null) and the route falls back to the site's generic
 * picture. A secondary figure that cannot be read in full is passed as null and
 * left off the card.
 */
export async function loadHubCardData(hub: HubDefinition): Promise<HubCardData | null> {
  const congress = (await billsService.getAvailableCongressNumbers())[0];
  if (!congress) return null;

  const exact = async (filter: Parameters<typeof billsService.fetchBillsCount>[0]) => {
    const result = await billsService.fetchBillsCount({ ...filter, congress: String(congress) });
    return result.exact && result.count !== null ? result.count : null;
  };

  if (hub.kind === 'status' && hub.filter.progressStage) {
    const [count, total] = await Promise.all([exact({ status: hub.filter.progressStage }), exact({})]);
    if (count === null || total === null) return null;
    return { kind: 'status', congress, stage: Number(hub.filter.progressStage), count, total };
  }

  if (hub.kind === 'chamber' && hub.filter.chamber) {
    const chamber = hub.filter.chamber;
    const other = chamber === 'house' ? 'senate' : 'house';
    const [count, otherCount, becameLaw] = await Promise.all([
      exact({ chamber }),
      exact({ chamber: other }),
      chamberBecameLaw(congress, chamber),
    ]);
    if (count === null || otherCount === null) return null;
    // The breakdown is a separate rollup; use its law count only when it
    // accounts for exactly the bills the page counts.
    const law = becameLaw && becameLaw.total === count ? becameLaw.law : null;
    return { kind: 'chamber', congress, chamber, count, otherCount, becameLaw: law };
  }

  if (hub.kind === 'topic' && hub.filter.policyArea) {
    const topic = hub.filter.policyArea;
    const counts = await Promise.all(
      POLICY_AREAS.map(async (name) => ({ name, count: await exact({ policyArea: name }) })),
    );
    const mine = counts.find((c) => c.name === topic)?.count ?? null;
    if (mine === null) return null;
    const ranking = counts.every((c) => c.count !== null)
      ? counts.map((c) => ({ name: c.name, count: c.count as number }))
      : null;
    return { kind: 'topic', congress, topic, count: mine, ranking };
  }

  return null;
}

/**
 * A chamber's bills and how many became law, summed from its monthly rollup
 * (`congressChamberBreakdowns`, the home page's source). Null when there is no
 * rollup or it cannot be read.
 */
async function chamberBecameLaw(
  congress: number,
  chamber: 'house' | 'senate',
): Promise<{ total: number; law: number } | null> {
  const client = getConvexHttpClient();
  if (!client) return null;
  try {
    const { api } = await import('../../convex/_generated/api');
    const row = await client.query(api.bills.getChamberDeepBreakdown, { congress, chamber });
    if (!row) return null;
    let total = 0;
    let law = 0;
    for (const month of row.monthly) {
      total += month.count;
      law += month.becameLaw;
    }
    return { total, law };
  } catch (error) {
    console.error(`chamberBecameLaw(${congress}, ${chamber}) failed:`, error);
    return null;
  }
}
