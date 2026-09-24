/**
 * Starters generated from live dashboard numbers (spec §6.1).
 *
 * A hardcoded "What does this bill do?" reads as a demo; "2,070 health bills
 * are in committee — why?" reads as a live site.
 *
 * Every starter must lead somewhere that actually answers it — a starter that
 * ends in "we don't hold that", or in half an answer, is worse than none.
 *
 * That rule is why the three data starters are LINKS, not questions. Asked of
 * the answer engine they were the worst questions on the site: from 2 to 24
 * Sep 2026 they were clicked 96 times, 27 readers left before any answer came,
 * and 63 of the 69 answers stopped early — median 24–30 seconds — because each
 * asks about hundreds or thousands of bills and the engine reads 50 per lookup.
 * The site already has a page that answers each one completely: the enacted,
 * topic and in-committee hubs for the newest Congress, or the equivalent
 * filtered /bills list for an older one. Only the cold-start fallbacks, which
 * are narrow enough to answer, still ask.
 *
 * Shapes here mirror `api.bills.getCongressDashboard` exactly: `topPolicyAreas`
 * is `{ name, count }[]` and `statusBreakdown` is an OBJECT keyed by stage
 * name, not an array. Do not "tidy" these into a different shape.
 *
 * Pure module so it carries unit tests.
 */
import { formatCongressOrdinal } from './congress';
import { hubByPath, topicSlug } from './hubs';
import { BillStages } from './utils/bill-stages';

export interface StarterInput {
  congress: number;
  /**
   * The newest Congress with data. Hub pages always show that one, so a hub is
   * only the right destination when it is also the Congress on screen; for an
   * older one the starter links to the same filter on /bills instead.
   */
  latestCongress?: number | null;
  totalBills: number;
  topPolicyAreas: Array<{ name: string; count: number }>;
  statusBreakdown: {
    introduced?: number;
    inCommittee?: number;
    becameLaw?: number;
  } | null;
}

export type StarterKind = 'became_law' | 'top_topic' | 'in_committee' | 'fallback';

export interface Starter {
  kind: StarterKind;
  text: string;
  /** Where the starter goes. Absent only for fallbacks, which are asked. */
  href?: string;
}

const fmt = (n: number) => n.toLocaleString('en-US');

function onLatest(input: StarterInput): boolean {
  return input.latestCongress != null && input.congress === input.latestCongress;
}

/**
 * The hub when it shows this Congress and exists, else the same filter on
 * /bills. Mirrors `policyAreaHref` in DashboardClient: an unknown hub path is a
 * hard 404, so it is only used when `hubByPath` knows it.
 */
function destination(
  input: StarterInput,
  hubPath: string,
  filter: Record<string, string>,
): string {
  if (onLatest(input) && hubByPath(hubPath)) return hubPath;
  const params = new URLSearchParams({ congress: String(input.congress), ...filter });
  return `/bills?${params.toString()}`;
}

export function starters(input: StarterInput): Starter[] {
  const out: Starter[] = [];
  const ordinal = formatCongressOrdinal(input.congress);
  const topArea = input.topPolicyAreas?.[0];
  const becameLaw = input.statusBreakdown?.becameLaw ?? 0;
  const inCommittee = input.statusBreakdown?.inCommittee ?? 0;

  if (topArea && topArea.count > 0) {
    out.push({
      kind: 'top_topic',
      text: `${fmt(topArea.count)} ${topArea.name.toLowerCase()} bills this Congress — see what they are`,
      href: destination(input, `/bills/topic/${topicSlug(topArea.name)}`, {
        policyArea: topArea.name,
      }),
    });
  }
  if (becameLaw > 0) {
    out.push({
      kind: 'became_law',
      text: `Only ${fmt(becameLaw)} bills became law — see which ones`,
      href: destination(input, '/bills/enacted', { status: String(BillStages.BECAME_LAW) }),
    });
  }
  // A statement in the site's own voice, so it appears only when the data backs
  // it: more than half the Congress's bills actually in committee. Early in a
  // new Congress most bills can still be at "introduced", and the line would
  // then be false. It leads with the in-committee count because that is the
  // number the destination page shows.
  if (input.totalBills > 0 && inCommittee * 2 > input.totalBills) {
    const href = destination(input, '/bills/in-committee', {
      status: String(BillStages.IN_COMMITTEE),
    });
    const share = `${fmt(inCommittee)} of the ${fmt(input.totalBills)} bills`;
    out.push({
      kind: 'in_committee',
      // "Why" only where the destination explains it: the in-committee hub
      // carries that explainer, a filtered /bills list for an older Congress
      // does not — so there the starter promises only what the list shows.
      text:
        href === '/bills/in-committee'
          ? `Why ${share} are still in committee`
          : `${share} stalled in committee — see them`,
      href,
    });
  }

  // Fallbacks, in order, for a cold or empty dataset. Asked, not linked.
  const fallbacks = [
    `What is the ${ordinal} Congress working on?`,
    'Which members introduce the most bills?',
    'Which policy areas have the most bills right now?',
  ];
  for (const text of fallbacks) {
    if (out.length >= 3) break;
    if (!out.some((s) => s.text === text)) out.push({ kind: 'fallback', text });
  }

  return out.slice(0, 3);
}
