/**
 * The sentence under "Introductions, month by month": the busiest month, the
 * quietest, and the month whose bills produced the most laws.
 *
 * The chart counts each law in the month its bill was FILED, because that is
 * what the bars are: introductions. The sentence used to call that month the
 * one with "the most signed", which was false in every Congress: it said
 * Jan ’25 (27) for the 119th, whose laws were signed most in Dec ’25 (26), and
 * Feb ’21 (47) for the 117th, whose laws were signed most in Dec ’22 (116).
 *
 * The quietest month skips months that were only partly in session: the few
 * days of January when a Congress ends, and the month in progress. "Quietest:
 * Oct ’26 (98)" was five days into October.
 *
 * Pure module so it carries unit tests.
 */
import { congressStartYear } from './congress';

export interface CadenceMonth {
  /** "YYYY-MM" */
  month: string;
  count: number;
  becameLaw: number;
}

export interface CadenceNarration {
  peak?: CadenceMonth;
  /** Absent until there are two full months to compare. */
  quietest?: CadenceMonth;
  /** The month whose bills went on to produce the most laws. */
  lawPeak?: CadenceMonth;
  totalLaws: number;
}

export function cadenceNarration(
  months: CadenceMonth[],
  congress: number,
  today: Date = new Date(),
): CadenceNarration {
  const finalJanuary = `${congressStartYear(congress) + 2}-01`;
  const thisMonth = today.toISOString().slice(0, 7);
  const full = months.filter((m) => m.month !== finalJanuary && m.month !== thisMonth);

  const byCount = [...months].sort((a, b) => b.count - a.count);
  const quiet = [...full].sort((a, b) => a.count - b.count);
  // A quietest month needs at least two full months to compare, and must not be
  // the busiest one: early in a Congress there is one full month, or none.
  const quietest = full.length >= 2 && quiet[0] !== byCount[0] ? quiet[0] : undefined;
  const lawPeak = [...months].filter((m) => m.becameLaw > 0).sort((a, b) => b.becameLaw - a.becameLaw)[0];

  return {
    peak: byCount[0],
    quietest,
    lawPeak,
    totalLaws: months.reduce((s, m) => s + m.becameLaw, 0),
  };
}
