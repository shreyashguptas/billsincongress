/**
 * What a congressional measure type actually is (defect D14).
 *
 * Congress numbers eight kinds of measure, and only two of them are bills. Our
 * totals count all eight: congressStats.totalCount for the 119th is 18,476,
 * of which 2,500 are simple and concurrent resolutions that can never become
 * law. Handing that number to the model under the word "bills" produced answers
 * that were wrong by ~3,000 with a citation attached.
 *
 * The single-measure half of this problem was fixed in 3fb72f4 ("Stop the
 * assistant calling resolutions bills"). This is the aggregate half.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */

export type MeasureClass = "bill" | "joint_resolution" | "concurrent_resolution" | "simple_resolution";

/**
 * Simple and concurrent resolutions are never presented to the President.
 * A concurrent resolution passes both chambers and still is not law — it is
 * how Congress talks to itself (budget resolutions, adjournment, sense-of-
 * Congress). A simple resolution binds one chamber only (rules, committee
 * assignments, honorifics).
 *
 * A Map, not an object literal: a plain object inherits Object.prototype, so
 * CLASSES["constructor"] returns a function and CLASSES["__proto__"] an object.
 * Both slipped past `?? null` and made measureClass return something that is
 * not a MeasureClass, and measureNoun return undefined — which reaches a reader
 * as the word "undefined". Every unrecognised string must take the null path.
 */
const CLASSES = new Map<string, MeasureClass>([
  ["hr", "bill"],
  ["s", "bill"],
  ["hjres", "joint_resolution"],
  ["sjres", "joint_resolution"],
  ["hconres", "concurrent_resolution"],
  ["sconres", "concurrent_resolution"],
  ["hres", "simple_resolution"],
  ["sres", "simple_resolution"],
]);

const NOUNS: Record<MeasureClass, string> = {
  bill: "bill",
  joint_resolution: "joint resolution",
  concurrent_resolution: "concurrent resolution",
  simple_resolution: "simple resolution",
};

/**
 * Callers pass either `billType` ("hconres") or `billTypeLabel` ("H.Con.Res.") —
 * both live on the same row and are easy to confuse. Stripping dots, spaces and
 * case means the printed form classifies correctly instead of returning null and
 * making the model say "unknown measure type" about an ordinary resolution.
 */
function normalise(billType: string): string {
  return billType.toLowerCase().replace(/[.\s]/g, "");
}

/** null for anything Congress does not number, so callers can say so rather than guess. */
export function measureClass(billType: string): MeasureClass | null {
  return CLASSES.get(normalise(billType)) ?? null;
}

/** True for hr and s only — what an ordinary reader means by "a bill". */
export function isBill(billType: string): boolean {
  return measureClass(billType) === "bill";
}

/**
 * True for anything that can be presented to the President.
 * Joint resolutions count: they carry the same force as a bill once signed, and
 * are the vehicle for continuing resolutions, CRA disapprovals and proposed
 * constitutional amendments (those go to the states, not the President, but
 * they are still the joint-resolution track).
 */
export function canBecomeLaw(billType: string): boolean {
  const cls = measureClass(billType);
  return cls === "bill" || cls === "joint_resolution";
}

/** Plain-English singular noun for the reader, e.g. "bill", "simple resolution". */
export function measureNoun(billType: string): string {
  const cls = measureClass(billType);
  return cls === null ? billType : NOUNS[cls];
}

function format(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * The catalog gotcha explaining that our totals count MEASURES, not bills, with
 * the real per-type split for whichever Congress the caller counted.
 *
 * Never fabricates: an empty or all-zero map yields the warning with no numbers
 * in it at all. Inventing a plausible split is exactly the failure this module
 * exists to stop.
 */
export function measureMixNote(counts: Record<string, number>): string {
  let bills = 0;
  let joint = 0;
  let concurrent = 0;
  let simple = 0;
  let other = 0;

  for (const [type, raw] of Object.entries(counts)) {
    // NaN or Infinity from a bad aggregation would print as "NaN measures";
    // drop it rather than emit a number-shaped non-number to the model.
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    switch (measureClass(type)) {
      case "bill":
        bills += raw;
        break;
      case "joint_resolution":
        joint += raw;
        break;
      case "concurrent_resolution":
        concurrent += raw;
        break;
      case "simple_resolution":
        simple += raw;
        break;
      default:
        other += raw;
    }
  }

  const total = bills + joint + concurrent + simple + other;

  const generic =
    "Our totals count MEASURES, not bills. Every total includes simple and " +
    "concurrent resolutions (H.Res., S.Res., H.Con.Res., S.Con.Res.), which are " +
    "not bills and can never become law, alongside bills (H.R., S.) and joint " +
    "resolutions (H.J.Res., S.J.Res.), which can. Do not describe a total as a " +
    "number of bills. Say 'measures', or count the types you actually mean.";

  if (total <= 0) return generic;

  const nonLaw = concurrent + simple;
  const parts = [
    `Our totals count MEASURES, not bills: of ${format(total)} measures, ` +
      `${format(bills)} are bills proper (H.R., S.) and ${format(joint)} are joint ` +
      `resolutions (H.J.Res., S.J.Res.), which can also become law.`,
  ];
  if (nonLaw > 0) {
    // "A further", not "the remaining": with unrecognised types in the map,
    // total - bills - joint is larger than simple + concurrent, and a note that
    // fails its own arithmetic is the thing this module exists to prevent.
    parts.push(
      `A further ${format(nonLaw)} — ${format(simple)} simple resolutions ` +
        `(H.Res., S.Res.) and ${format(concurrent)} concurrent resolutions ` +
        `(H.Con.Res., S.Con.Res.) — are NOT bills and can never become law; they are ` +
        `internal business of Congress.`,
    );
  }
  if (other > 0) {
    parts.push(`${format(other)} measures carry a type we do not recognise; leave them uncounted.`);
  }
  // A map of nothing but H.R. and S. really is all bills. Saying it "overstates
  // the bills by 0" would invite the model to hedge a number that is correct.
  if (total > bills) {
    parts.push(
      `So a total described as '${format(total)} bills' overstates the bills by ` +
        `${format(total - bills)}. Call it '${format(total)} measures', or say ` +
        `${format(bills)} when the reader means bills.`,
    );
  }

  return parts.join(" ");
}
