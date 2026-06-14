/**
 * Committee base-rate math — PURE (no Convex imports) so it can be unit-tested
 * in isolation and reused by the precompute job and the read path.
 *
 * The statistic answers, for a bill that has sat in committee for N days:
 * "Among bills from finished Congresses that were ALSO still in committee this
 * long, what share ever advanced past committee?" It is a fact about a group of
 * past bills — never a prediction about a single bill.
 *
 * See `convex/baseRates.test.ts` for the worked example behind these numbers.
 */

export type Chamber = "house" | "senate";

/** One finished-Congress bill, reduced to just what the math needs. */
export interface BaseRateSample {
  chamber: Chamber;
  /** Did the bill ever advance past committee (pass a chamber)? */
  advanced: boolean;
  /** Days from introduction to first chamber passage; null if never advanced. */
  firstAdvanceDays: number | null;
}

export interface BaseRateBucket {
  chamber: Chamber;
  bucketStart: number;
  bucketEnd: number;
  advancedCount: number;
  totalCount: number;
  ratePercent: number;
  sampleSize: number;
}

/** Sentinel for the open-ended final bucket (Convex can't store Infinity). */
export const OPEN_BUCKET_END = 1_000_000;

/** Day-bucket start boundaries: [0,90), [90,180), [180,365), [365,∞). */
export const BUCKET_STARTS = [0, 90, 180, 365] as const;

/** Don't surface a bucket's rate unless it's backed by at least this many bills. */
export const MIN_BASE_RATE_SAMPLE = 100;

/** Milliseconds in a day — shared day-math constant. */
export const MS_PER_DAY = 86_400_000;

const CHAMBERS: Chamber[] = ["house", "senate"];

function bucketEndFor(start: number): number {
  const idx = BUCKET_STARTS.indexOf(start as (typeof BUCKET_STARTS)[number]);
  const next = BUCKET_STARTS[idx + 1];
  return next ?? OPEN_BUCKET_END;
}

/**
 * Turn a flat list of finished-Congress bills into per-(chamber, bucket) rates.
 *
 * For each bucket start day D: a bill is "still in committee at day D" if it
 * never advanced, OR it advanced on/after day D. Of those, the ones that
 * eventually advanced form the numerator. So a never-advanced bill lands in the
 * denominator of every bucket, and the rate falls as D grows.
 */
export function computeBaseRateBuckets(
  samples: BaseRateSample[],
): BaseRateBucket[] {
  const rows: BaseRateBucket[] = [];

  for (const chamber of CHAMBERS) {
    const chamberSamples = samples.filter((s) => s.chamber === chamber);

    for (const start of BUCKET_STARTS) {
      let totalCount = 0;
      let advancedCount = 0;

      for (const s of chamberSamples) {
        if (!s.advanced) {
          // Never advanced → in committee at every bucket start.
          totalCount += 1;
        } else if (s.firstAdvanceDays !== null && s.firstAdvanceDays >= start) {
          // Still in committee at day `start`, then advanced.
          totalCount += 1;
          advancedCount += 1;
        }
        // Advanced before day `start` → no longer in committee → excluded.
      }

      rows.push({
        chamber,
        bucketStart: start,
        bucketEnd: bucketEndFor(start),
        advancedCount,
        totalCount,
        ratePercent:
          totalCount > 0 ? Math.round((advancedCount / totalCount) * 100) : 0,
        sampleSize: totalCount,
      });
    }
  }

  return rows;
}
