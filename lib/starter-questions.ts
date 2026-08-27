/**
 * Starters generated from live dashboard numbers (spec §6.1).
 *
 * A hardcoded "What does this bill do?" reads as a demo; "2,070 health bills
 * are in committee — why?" reads as a live site.
 *
 * Every starter must be a question our catalog can actually answer — a starter
 * that leads to "we don't hold that" is worse than no starter at all.
 *
 * Shapes here mirror `api.bills.getCongressDashboard` exactly: `topPolicyAreas`
 * is `{ name, count }[]` and `statusBreakdown` is an OBJECT keyed by stage
 * name, not an array. Do not "tidy" these into a different shape.
 *
 * Pure module so it carries unit tests.
 */
import { formatCongressOrdinal } from './congress';

export interface StarterInput {
  congress: number;
  totalBills: number;
  topPolicyAreas: Array<{ name: string; count: number }>;
  statusBreakdown: {
    introduced?: number;
    inCommittee?: number;
    becameLaw?: number;
  } | null;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export function starterQuestions(input: StarterInput): string[] {
  const out: string[] = [];
  const ordinal = formatCongressOrdinal(input.congress);
  const topArea = input.topPolicyAreas?.[0];
  const becameLaw = input.statusBreakdown?.becameLaw ?? 0;

  if (topArea && topArea.count > 0) {
    out.push(
      `${fmt(topArea.count)} ${topArea.name.toLowerCase()} bills this Congress — what are they about?`,
    );
  }
  if (becameLaw > 0) {
    out.push(`Only ${fmt(becameLaw)} bills became law. Which ones?`);
  }
  if (input.totalBills > 0) {
    out.push(`Why do most of the ${fmt(input.totalBills)} bills never leave committee?`);
  }

  // Fallbacks, in order, for a cold or empty dataset.
  const fallbacks = [
    `What is the ${ordinal} Congress working on?`,
    'Which members introduce the most bills?',
    'Which policy areas have the most bills right now?',
  ];
  for (const f of fallbacks) {
    if (out.length >= 3) break;
    if (!out.includes(f)) out.push(f);
  }

  return out.slice(0, 3);
}
