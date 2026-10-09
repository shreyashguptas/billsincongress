/**
 * Keeping the web fallback to the bill the reader asked about.
 *
 * WHY THIS EXISTS. When a bill has no official summary yet, the model searches
 * the web. The search engine matches on a bill's short title as much as on its
 * number, and short titles repeat: this Congress has two "GAP Act"s. On
 * 2026-10-08 the page for H.R. 10725 (a Medicare bill) told a reader it "would
 * strengthen the review of foreign-adversary investments in the general-aviation
 * sector" — that is H.R. 9707. Three of the five pages the search returned were
 * H.R. 9707's, and nothing checked. In that week 17 of 31 searches for a
 * numbered bill came back with at least one page about a different bill.
 *
 * WHAT IT DOES. Reads the bill references a result names in its URL or title
 * (`house-bill/9707`, `BILLS-119hr9707ih`, `hr-9707`, `H.R. 9707`, `/hr/9707`)
 * and drops a result that names only bills other than the one in scope. A
 * result that names no bill is kept — a sponsor's press release usually names
 * none, and dropping it would cost the reader real context for no protection.
 * A result that names the bill in scope is kept even if it also names others.
 *
 * Congress counts: H.R. 10717 of the 93rd Congress is not H.R. 10717 of the
 * 119th, and a search for the latter returned the former's pages. A reference
 * whose Congress cannot be read matches on chamber and number alone.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */

export interface BillRef {
  /** Normalised Congress.gov type: hr, s, hres, sres, hjres, sjres, hconres, sconres. */
  type: string;
  number: number;
  congress?: number;
}

/**
 * Abbreviated forms, longest first so "h.con.res." is not read as "h." + noise.
 * `hb` / `sb` are how some trackers write federal bills (`us119/bills/sb2641`).
 */
const SHORT_TYPES: ReadonlyArray<[RegExp, string]> = [
  [/h\.?\s*con\.?\s*res\.?/, "hconres"],
  [/s\.?\s*con\.?\s*res\.?/, "sconres"],
  [/h\.?\s*j\.?\s*res\.?/, "hjres"],
  [/s\.?\s*j\.?\s*res\.?/, "sjres"],
  [/h\.?\s*res\.?/, "hres"],
  [/s\.?\s*res\.?/, "sres"],
  [/h\.?\s*r\.?/, "hr"],
  [/hb/, "hr"],
  [/sb/, "s"],
  [/s\.?/, "s"],
];

/** Congress.gov's long URL segments: `/house-bill/9707`, `/senate-joint-resolution/12`. */
const LONG_TYPES: Readonly<Record<string, string>> = {
  "house-bill": "hr",
  "senate-bill": "s",
  "house-resolution": "hres",
  "senate-resolution": "sres",
  "house-joint-resolution": "hjres",
  "senate-joint-resolution": "sjres",
  "house-concurrent-resolution": "hconres",
  "senate-concurrent-resolution": "sconres",
};

const SHORT_ALTERNATION = SHORT_TYPES.map(([re]) => `(?:${re.source})`).join("|");

/**
 * An abbreviated reference: optional Congress right before it (`119hr9707`,
 * `/119/hr-9494`, `119-s-5427`, `us-119th-hr-10543`), the type, the number,
 * optional Congress right after it (`hr9523-119`).
 *
 * The type may not follow a letter (so "posts-12" is not S. 12), a dot (so
 * "U.S. 2026" is not S. 2026) or an apostrophe ("America's 250th"). It may follow a digit, which is how
 * `BILLS-119hr9707ih` writes it.
 */
const SHORT_REF = new RegExp(
  `(?:(?<![\\d])(\\d{2,3})(?:st|nd|rd|th)?[\\s/_-]*)?` +
    `(?<![a-z.'\u2019])(${SHORT_ALTERNATION})[\\s_/+#-]*(\\d{1,5})(?!\\d)` +
    `(?:[-_](\\d{2,3})(?![\\d]))?`,
  "gi",
);

const LONG_REF = new RegExp(`(${Object.keys(LONG_TYPES).join("|")})/(\\d{1,5})(?!\\d)`, "gi");

/** "119th Congress", "119th-congress", "93rd_congress". */
const ORDINAL_CONGRESS = /(?<!\d)(\d{1,3})(?:st|nd|rd|th)[\s_-]*congress/i;

/** Congresses that exist or will within a century. Anything else is a misread. */
function plausibleCongress(n: number | undefined, min = 1): number | undefined {
  return n !== undefined && n >= min && n <= 200 ? n : undefined;
}

/**
 * Floor for a bare number read as a Congress because it sits next to a bill
 * reference (`/93/hr10717`, `hr9523-119`). A news URL puts a month or a day
 * there — `/2026/10/08/hr-10725-gap-act` is not the 8th Congress's bill — and
 * no source we parse lists a Congress that early by number alone.
 * Congress.gov's bill pages start at the 93rd. Written-out ordinals ("1st
 * Congress") are not held to it.
 */
const MIN_ADJACENT_CONGRESS = 80;

function normaliseShortType(raw: string): string {
  const compact = raw.toLowerCase().replace(/[\s.]/g, "");
  for (const [re, type] of SHORT_TYPES) {
    if (new RegExp(`^(?:${re.source})$`).test(compact)) return type;
  }
  return compact;
}

/** URL-decode what can be decoded: `?119%2Fhr10725=`, `H.R.+10571`. */
function readable(text: string): string {
  const spaced = text.replace(/\+/g, " ");
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

/**
 * This site's own bill ids, `10543hr119`: number, type, Congress. Read before
 * the abbreviated forms, which would see "hr119" in it — H.R. 119. Only in our
 * own URLs: elsewhere `119hr94` could be either reading.
 */
const OWN_BILL_URL = /billsincongress\.com\/bills\/(\d{1,5}[a-z]{1,7}\d{1,3})(?![\da-z])/gi;

/** Every bill reference a piece of text names, with its Congress where stated. */
export function billRefsIn(text: string): BillRef[] {
  const refs: BillRef[] = [];
  const plain = readable(text).replace(OWN_BILL_URL, (_, id: string) => {
    const ref = billRefFromId(id.toLowerCase());
    if (ref) refs.push(ref);
    return "";
  });
  const ordinal = ORDINAL_CONGRESS.exec(plain);
  const pageCongress = plausibleCongress(ordinal ? Number(ordinal[1]) : undefined);

  for (const m of plain.matchAll(LONG_REF)) {
    refs.push({
      type: LONG_TYPES[m[1].toLowerCase()],
      number: Number(m[2]),
      ...(pageCongress !== undefined && { congress: pageCongress }),
    });
  }
  for (const m of plain.matchAll(SHORT_REF)) {
    const congress =
      plausibleCongress(m[1] ? Number(m[1]) : undefined, MIN_ADJACENT_CONGRESS) ??
      plausibleCongress(m[4] ? Number(m[4]) : undefined, MIN_ADJACENT_CONGRESS) ??
      pageCongress;
    const number = Number(m[3]);
    if (number === 0) continue;
    refs.push({
      type: normaliseShortType(m[2]),
      number,
      ...(congress !== undefined && { congress }),
    });
  }
  return refs;
}

/** `10725hr119` → H.R. 10725 of the 119th. Null for anything else. */
export function billRefFromId(billId: string): BillRef | null {
  const m = /^(\d{1,5})([a-z]{1,7})(\d{1,3})$/.exec(billId);
  if (!m) return null;
  return { type: m[2], number: Number(m[1]), congress: Number(m[3]) };
}

/** One of our bill ids written into prose: `5395s119`. Types listed explicitly. */
const BILL_ID_IN_TEXT = /(?<![\da-z])(\d{1,5}(?:hr|s|hres|sres|hjres|sjres|hconres|sconres)\d{2,3})(?![\da-z])/g;

function sameBill(a: BillRef, b: BillRef): boolean {
  if (a.type !== b.type || a.number !== b.number) return false;
  return a.congress === undefined || b.congress === undefined || a.congress === b.congress;
}

/**
 * Which bills a search is about: every bill the model's query names, the bill
 * the reader has open, and any of our bill ids in the model's stated reason
 * ("We don't have the official summary for bill 5395s119"). A union, because
 * each only ever WIDENS what is kept: on a bill page the model may look up a
 * companion by number, and a rule's title names the bill it governs ("Providing
 * for consideration of H.R. 1234") without the rule itself being any less in
 * scope. Empty means "no bill in scope": filter nothing.
 *
 * A query that names a Congress other than the open bill's ("GAP Act Medicare
 * 116th Congress") is not filtered at all: it is plainly looking for an earlier
 * version, whose number the model does not know, and pinning it to the open
 * bill would empty it. Dropping only the open bill is not enough: a title can
 * name other bills ("…the Washington, D.C. Admission Act (H.R. 51 and S. 51)"),
 * and those alone would then be in scope.
 *
 * A bill named in the query without a Congress borrows the open bill's Congress
 * when it IS the open bill, so "H.R. 10717 summary" on the 119th's page still
 * rejects the 93rd's H.R. 10717.
 */
export function billsInScope(query: string, pageBillId?: string, reason = ""): BillRef[] {
  const ordinal = ORDINAL_CONGRESS.exec(readable(query));
  const queryCongress = plausibleCongress(ordinal ? Number(ordinal[1]) : undefined);
  const page = pageBillId ? billRefFromId(pageBillId) : null;
  if (page && queryCongress !== undefined && queryCongress !== page.congress) return [];
  const named = billRefsIn(query).filter(
    (ref) => !(page && ref.congress === undefined && page.type === ref.type && page.number === ref.number),
  );
  const inReason = [...reason.matchAll(BILL_ID_IN_TEXT)].flatMap((m) => billRefFromId(m[1]) ?? []);
  return [...(page ? [page] : []), ...named, ...inReason];
}

const TYPE_LABELS: Readonly<Record<string, string>> = {
  hr: "H.R.", s: "S.", hres: "H.Res.", sres: "S.Res.", hjres: "H.J.Res.", sjres: "S.J.Res.",
  hconres: "H.Con.Res.", sconres: "S.Con.Res.",
};

/** "H.R. 10725 (119th Congress)", for telling the model what the filter kept. */
export function describeBillRef(ref: BillRef): string {
  const label = `${TYPE_LABELS[ref.type] ?? ref.type} ${ref.number}`;
  return ref.congress === undefined ? label : `${label} (${ordinalOf(ref.congress)} Congress)`;
}

function ordinalOf(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export interface WebHit {
  url: string;
  title: string;
}

/**
 * Drop the results that are about some other bill. Keeps a result that names
 * no bill, and one that names a bill in scope. With nothing in scope, keeps all.
 */
export function keepWebResultsForBill<T extends WebHit>(
  hits: T[],
  scope: BillRef[],
): { kept: T[]; removed: T[] } {
  if (scope.length === 0) return { kept: hits, removed: [] };
  const kept: T[] = [];
  const removed: T[] = [];
  for (const hit of hits) {
    const refs = [...billRefsIn(hit.url), ...billRefsIn(hit.title)];
    const aboutOther = refs.length > 0 && !refs.some((r) => scope.some((s) => sameBill(r, s)));
    (aboutOther ? removed : kept).push(hit);
  }
  return { kept, removed };
}
