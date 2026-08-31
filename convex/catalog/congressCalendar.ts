/**
 * The clock and the calendar the answer engine never had.
 *
 * TWO DEFECTS LIVE HERE.
 *
 * (1) Nothing on the answer path knew that a Congress ENDS. Asked "how many
 * bills from the 118th are still sitting in committee?" the assistant answered
 * "18,229, sitting in committee". 18,229 is the real stored count of 118th
 * bills at progressStage 40 — but the 118th adjourned sine die on 2025-01-03,
 * so every one of them died there. The true answer to "still sitting" is zero.
 * Roughly 37,000 of the ~55,000 bills we hold (the 117th and 118th) are in that
 * state and were being narrated in the present tense: "the bill has passed the
 * House and now sits in the Senate... what happens next is up to the Senate."
 *
 * (2) The model was never told the date either — there was no clock anywhere in
 * tools.ts, context.ts or answer.ts — so "recent", "this year" and "how long
 * ago" were all computed against its training cutoff.
 *
 * ARITHMETIC. A Congress runs two years, convening 3 January of an odd year and
 * adjourning sine die on 3 January two years later — since the 20th Amendment;
 * see FIRST_JANUARY_CONGRESS below for the 4 March terms before it. The Nth
 * began in 1789 + 2*(N-1), the same convention as `congressStartYear` in lib/congress.ts
 * and `getCongressInfo` in convex/bills.ts. Duplicated rather than imported
 * because Convex bundles from convex/ and nothing here reaches into app code.
 *
 * DATES ARE COMPARED AS STRINGS, never through `new Date`. Zero-padded ISO
 * dates sort lexicographically, and `new Date("2025-01-03")` parses as UTC
 * midnight, so any local-time read of it lands on 2 January west of Greenwich —
 * which is exactly the boundary this module exists to get right.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */

export interface CongressWindow {
  congress: number;
  startDate: string; // ISO "YYYY-MM-DD"
  endDate: string; // ISO "YYYY-MM-DD", the sine die adjournment
}

const FIRST_CONGRESS_YEAR = 1789;

/**
 * Convening day and adjournment day are both 3 January — but only since the
 * 20th Amendment, in force 15 October 1933. Terms before it ran 4 March to
 * 4 March. The 73rd straddles the change: it convened 1933-03-04 and was cut
 * short on 1935-01-03, when the 74th convened.
 *
 * We hold no bills before the 117th, but parsePageContext accepts any congress
 * 1-200, so a reader on any page can put the 50th into this note. Dating its
 * adjournment 1889-01-03 instead of 1889-03-04 would be exactly the kind of
 * confident wrong fact this module exists to stop.
 */
const FIRST_JANUARY_CONGRESS = 74;
const MARCH_TERM_DAY = "03-04";
const JANUARY_TERM_DAY = "01-03";

function termDay(congress: number): string {
  return congress >= FIRST_JANUARY_CONGRESS ? JANUARY_TERM_DAY : MARCH_TERM_DAY;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ordinal suffix, so the note reads "121st" and not "121th". */
function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

function assertIsoDate(isoDate: string): void {
  // A malformed date would silently pick the wrong Congress, which is the class
  // of error this module exists to end. Fail loudly instead.
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`expected an ISO date "YYYY-MM-DD", got "${isoDate}"`);
  }
}

export function congressWindow(congress: number): CongressWindow {
  const startYear = FIRST_CONGRESS_YEAR + (congress - 1) * 2;
  return {
    congress,
    startDate: `${startYear}-${termDay(congress)}`,
    // A Congress ends the instant its successor convenes, so the closing day
    // follows the SUCCESSOR's convention. That is why the 73rd, which convened
    // 1933-03-04, ends 1935-01-03 rather than 1935-03-04.
    endDate: `${startYear + 2}-${termDay(congress + 1)}`,
  };
}

/**
 * The Congress sitting on the given ISO date.
 *
 * 3 January of an odd year belongs to the Congress that CONVENES that day, not
 * the one adjourning. Both are true of the same date in the stored data — five
 * 117th bills and eighteen 118th bills carry introducedDate 2023-01-03 — so the
 * tie has to be broken by rule, and the rule is "the new one".
 */
export function congressForDate(isoDate: string): number {
  assertIsoDate(isoDate);
  const year = Number(isoDate.slice(0, 4));
  // Every Congress convenes in an odd year, so exactly one can have convened in
  // this date's own year: the one starting in `year`, or in `year - 1` when the
  // year is even.
  const startYear = year % 2 === 1 ? year : year - 1;
  const candidate = (startYear - FIRST_CONGRESS_YEAR) / 2 + 1;
  // Earlier in the year than that Congress's convening day, its predecessor was
  // still sitting. Asking the window rather than assuming 3 January keeps this
  // right for pre-1935 terms, which turned over on 4 March.
  return isoDate >= congressWindow(candidate).startDate ? candidate : candidate - 1;
}

/** True when that Congress had adjourned by the given ISO date. */
export function isCongressClosed(congress: number, asOfIso: string): boolean {
  assertIsoDate(asOfIso);
  return asOfIso >= congressWindow(congress).endDate;
}

/**
 * One sentence for the system prompt telling the model what today is and, when
 * the Congress in question has ended, that everything in it is final and must
 * be described in the past tense.
 *
 * Kept under 90 words: it is pasted into EVERY prompt. Dates stay ISO because
 * the model must not have to guess a locale.
 */
export function calendarNote(congress: number, asOfIso: string): string {
  assertIsoDate(asOfIso);
  const { startDate, endDate } = congressWindow(congress);
  const name = `${ordinal(congress)} Congress`;
  const today = `Today is ${asOfIso}.`;

  if (isCongressClosed(congress, asOfIso)) {
    // "Every bill in it died" would be false for the 274 bills the 118th enacted
    // and the 365 the 117th enacted; those are law and stay law. The death
    // clause has to be scoped to bills still unfinished at adjournment, or this
    // note trades one false answer for another.
    return (
      `${today} The ${name} adjourned sine die on ${endDate} and is over. Every bill ` +
      `unfinished then died at that moment: none can now advance, pass, or become law, ` +
      `and one shown as "in committee" died in committee. Bills enacted before ` +
      `${endDate} remain law. Use the past tense only, and never call anything in it ` +
      `pending, waiting or active. "Is any of it still in committee?" is answered NO, ` +
      `however many rows sit at that stage. Reviving one takes reintroduction in a ` +
      `later Congress.`
    );
  }

  // A Congress the reader can name but that has not convened yet holds no bills
  // at all; calling it "in progress" would invent a session.
  if (asOfIso < startDate) {
    return (
      `${today} The ${name} has not convened — it begins ${startDate}. No bills exist ` +
      `in it yet, so report none and say why rather than giving a total.`
    );
  }

  return (
    `${today} The ${name} convened ${startDate} and sits until ${endDate}, so it is in ` +
    `progress: every count is a snapshot taken today and will grow as bills are ` +
    `introduced and acted on. Say when a total was taken rather than presenting it as ` +
    `the final tally.`
  );
}
