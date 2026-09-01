/**
 * The dataset catalog (spec §4.2, §4.3).
 *
 * This file is CURATED PROSE, not generated from the schema, and that is
 * deliberate. In schema-linked retrieval, answer quality is governed by
 * description quality rather than model quality — so the `gotchas` on each
 * dataset are the highest-value lines here. Every entry in `gotchas` is a
 * class of wrong answer that stops happening.
 *
 * When you add a dataset: add it here, add its handler in fetch.ts, and the
 * model discovers it automatically. No prompt surgery.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */
import type { DatasetDoc, DatasetName } from "./types";

export const DATASETS: Record<DatasetName, DatasetDoc> = {
  bills: {
    name: "bills",
    summary: "One row per bill: title, sponsor, chamber, status, dates.",
    grain: "One row per bill per Congress.",
    fields: [
      { name: "billId", type: "string", meaning: "Stable id, e.g. '1234hr119'. Use it with other datasets." },
      { name: "billTypeLabel", type: "string", meaning: "Printed form, e.g. 'H.R.' or 'S.'" },
      { name: "billNumber", type: "string", meaning: "Number within its type, e.g. '1234'." },
      { name: "title", type: "string", meaning: "Official title as filed." },
      { name: "congress", type: "number", meaning: "Which Congress, e.g. 119." },
      { name: "introducedDate", type: "string", meaning: "ISO date the bill was filed." },
      { name: "sponsorFirstName", type: "string", meaning: "Primary sponsor's first name." },
      { name: "sponsorLastName", type: "string", meaning: "Primary sponsor's last name." },
      { name: "sponsorParty", type: "string", meaning: "'D', 'R' or 'I'." },
      { name: "sponsorState", type: "string", meaning: "Two-letter state of the sponsor, e.g. 'MD'." },
      { name: "progressStage", type: "number", meaning: "Stage code. See gotchas — it is not a percentage." },
      { name: "policyAreaName", type: "string", meaning: "The single policy area assigned to the bill." },
      { name: "measureType", type: "string", meaning: "What this row IS in plain words: 'bill', 'joint resolution', 'concurrent resolution' or 'simple resolution'. Use it — a resolution is not a bill." },
      { name: "canBecomeLaw", type: "boolean", meaning: "False for simple and concurrent resolutions, which never reach the President. Never say one 'failed to become law'." },
      { name: "latestActionDate", type: "string", meaning: "ISO date of the most recent action." },
    ],
    filters: [
      { name: "billId", type: "string", allowed: "One exact bill, by id. The fastest way to fetch a named bill.", example: "1234hr119" },
      { name: "congress", type: "number", allowed: "A Congress number. Defaults to the current one, so SET IT EXPLICITLY when the reader asks about an earlier Congress.", example: "119" },
      { name: "titleFilter", type: "string", allowed: "Relevance search over the TITLE. Matches bills containing ANY of your words, not all.", example: "veterans housing" },
      { name: "policyArea", type: "string", allowed: "Use the `topics` dataset to find exact names.", example: "Health" },
      { name: "progressStage", type: "number", allowed: "Where the bill ENDED UP: 20, 40, 60, 80, 85, 90, 95 or 100. Mutually exclusive buckets.", example: "40" },
      { name: "reachedStage", type: "number", allowed: "Got AT LEAST this far, including everything that went further. The one for milestone questions.", example: "60" },
      { name: "sponsorState", type: "string", allowed: "Two-letter state code.", example: "MD" },
      { name: "sponsorFilter", type: "string[]", allowed: "Exact 'First Last' names. Use `sponsors` to find them. Two-word surnames are handled.", example: '["Monica De La Cruz"]' },
      { name: "chamber", type: "string", allowed: "'house' or 'senate'.", example: "senate" },
      { name: "billType", type: "string", allowed: "'hr', 's', 'hjres', 'sjres', etc.", example: "hr" },
      { name: "billNumber", type: "string", allowed: "Number within its type.", example: "1234" },
      { name: "sort", type: "string", allowed: "newest_action, oldest_action, newest_introduced, oldest_introduced. REQUIRED for any 'most recent' or 'first' question.", example: "newest_action" },
      { name: "groupBy", type: "string", allowed: "policyArea, progressStage, sponsorState, sponsorParty, billType or chamber. Returns ONE ROW PER GROUP with its own count — use it for any 'how many in each' question instead of one fetch per category.", example: "policyArea" },
      { name: "introducedAfter", type: "string", allowed: "ISO date. Bills introduced on or after it.", example: "2026-01-01" },
      { name: "introducedBefore", type: "string", allowed: "ISO date. Bills introduced on or before it.", example: "2026-06-30" },
      { name: "actionAfter", type: "string", allowed: "ISO date. Last action on or after it.", example: "2026-08-01" },
      { name: "actionBefore", type: "string", allowed: "ISO date. Last action on or before it.", example: "2026-08-31" },
    ],
    gotchas: [
      "When you already know a bill's id — because the reader has it open, or a previous result gave it to you — fetch it with {\"billId\": \"...\"} rather than decomposing it into congress, billType and billNumber. It is one exact lookup instead of a scan.",
      "progressStage is a STAGE CODE, one of 20/40/60/80/85/90/95/100. It is NOT a percentage and NOT a probability of passing. 20=introduced, 40=in committee, 60=passed one chamber, 80=passed both, 85=vetoed, 90=to president, 95=signed, 100=became law. 85 sits off the main path: a vetoed bill reached the President and stopped there — it did not advance to 90 or 95.",
      "We store only the PRIMARY sponsor. Co-sponsors are not in our data at all — never state or imply how many co-sponsors a bill has.",
      "titleFilter searches BILL TITLES ONLY, never the text of the bill. A bill about a subject whose title does not mention it will not be found this way. Prefer policyArea for subject questions.",
      "policyAreaName is ONE policy area per bill. Bills also carry a much richer list of legislative subjects, which this dataset does not expose.",
      "Most bills never leave committee. A bill at stage 40 is in the normal case, not a stalled one — do not describe it as stalled or failing.",
      "A bill missing from a Congress is not proof it does not exist. Congresses before the earliest synced one are simply not loaded.",
      "EVERY result tells you whether it is complete. `complete: true` means we read the entire set and `total` is exact — you may state it, and you may add several exact totals together to build a breakdown. `complete: false` means there is NO total: do not state a number, do not say 'none' or 'no results', and do not call any row the newest, oldest, largest or smallest. An empty incomplete result is not evidence of absence.",
      "For a BREAKDOWN — 'how many in each category', 'per state', 'by party' — pass groupBy and get one row per group with its own count, in ONE fetch. Do not loop a separate fetch per category: there are 31 policy areas and you will run out of lookups before you finish.",
      "To COUNT without spending context on rows, pass limit 0. You get an exact total and no rows, and the scan reaches much further. That is how you build a per-topic or per-state breakdown: one limit-0 fetch per category.",
      "Row order is NEVER meaningful unless the result says so. Check the `order` field. If it says `arbitrary`, the rows are in database insertion order and the first row is not the newest, largest or anything else. For 'the most recent X' you MUST pass a sort — reading the max off an unsorted page named the third-most-recent law as the most recent, and the true answer was not even on the page.",
      "'Started in the House' means the CHAMBER it originated in, which is four measure types, not one. Use chamber 'house' or 'senate'. Filtering billType 'hr' answers a narrower question and undercounts: of the 119th's 64 House-originated laws, 45 are H.R. and the rest are House joint resolutions.",
      "progressStage is where a bill STOPPED. It is not cumulative. A bill that became law is at 100 and is NOT counted in the 60 bucket, so counting stage 60 to answer 'how many passed a chamber' omits everything that went further. Use reachedStage for milestone questions and progressStage for 'where is it now' questions.",
      "titleFilter matches ANY of your words, not all of them, and searches TITLES ONLY — never the text of the bill. Two words will return roughly the union of both, so a count from it is inflated. Prefer policyArea for subject questions.",
    ],
    notCovered: [
      "Vote tallies and roll-call results",
      "Co-sponsors",
      "Committee hearing schedules",
      "Member biography, committee assignments, or contact details",
      "Floor speeches, debate transcripts, news coverage",
      "The full text of bills (we hold a link to the PDF, not the words)",
    ],
    examples: [
      '{ "congress": 119, "policyArea": "Health", "progressStage": 100, "limit": 1 } — with limit 0 for a pure count',
      '{ "congress": 119, "progressStage": 100, "sort": "newest_action" } — the most recent law',
      '{ "congress": 119, "progressStage": 100, "groupBy": "policyArea" } — how many laws in each category, in one call',
      '{ "congress": 119, "billType": "s", "reachedStage": 60 } — measures that passed the Senate, including those that went further',
      '{ "congress": 119, "sponsorState": "TX", "progressStage": 100 }',
      '{ "congress": 119, "actionAfter": "2026-08-01" } — what has moved this month',
      '{ "billId": "1234hr119" }',
    ],
  },

  bill_actions: {
    name: "bill_actions",
    summary: "Dated timeline of every step a bill has taken.",
    grain: "One row per recorded action on one bill, in true chronological order, earliest first.",
    fields: [
      { name: "billId", type: "string", meaning: "Which bill this action belongs to." },
      { name: "actionDate", type: "string", meaning: "ISO date the action happened." },
      { name: "text", type: "string", meaning: "Official description, in the clerk's wording." },
      { name: "type", type: "string", meaning: "Category, e.g. 'IntroReferral', 'Committee'." },
      { name: "sourceSystemName", type: "string", meaning: "Which chamber's system recorded it." },
    ],
    filters: [{ name: "billId", type: "string", allowed: "Required. Get it from `bills`.", example: "1234hr119" }],
    gotchas: [
      "Requires a billId — you cannot browse actions across bills. Look the bill up first.",
      "Action text is the clerk's official wording, often jargon. Translate it for the reader rather than quoting it raw.",
      "Roll-call tallies sometimes appear inside the action text (e.g. 'Passed Senate 51-50'). You may repeat a tally that is written in the text you were given, attributed to that action. You may NOT infer, total or compare votes beyond what a row literally says, and we hold no structured vote data.",
      "Absence of a recent action means nothing has been RECORDED, not that nothing is happening.",
    ],
    notCovered: ["Vote counts attached to an action", "Who spoke or voted", "Scheduled future actions"],
    examples: ['{ "billId": "1234hr119" }'],
  },

  bill_summaries: {
    name: "bill_summaries",
    summary: "Official plain-language summary written by the Congressional Research Service.",
    grain: "One row per summary version of one bill; newest is usually wanted.",
    fields: [
      { name: "billId", type: "string", meaning: "Which bill this summarises." },
      { name: "text", type: "string", meaning: "The summary itself. Written by CRS, not by us." },
      { name: "actionDesc", type: "string", meaning: "Which version of the bill it describes, e.g. 'Introduced in House'." },
      { name: "updateDate", type: "string", meaning: "ISO date this summary was published." },
    ],
    filters: [{ name: "billId", type: "string", allowed: "Required. Get it from `bills`.", example: "1234hr119" }],
    gotchas: [
      "Many bills have NO summary, especially recently introduced ones. Empty is a normal result — say so plainly rather than guessing what the bill does from its title.",
      "A summary describes ONE VERSION of the bill. If the bill was amended later, the summary may not match the current text.",
      "This is CRS's wording, a neutral government source. It is not our analysis and should not be presented as ours.",
    ],
    notCovered: ["Our own analysis or opinion", "Section-by-section breakdowns", "The bill's full legal text"],
    examples: ['{ "billId": "1234hr119" }'],
  },

  topics: {
    name: "topics",
    summary: "Policy areas and how many bills each has, for one Congress.",
    grain: "One row per policy area per Congress, with a precomputed count.",
    fields: [
      { name: "policyAreaName", type: "string", meaning: "Exact policy area name, e.g. 'Health'." },
      { name: "count", type: "number", meaning: "How many bills carry it in this Congress." },
      { name: "congress", type: "number", meaning: "Which Congress the count is for." },
    ],
    filters: [{ name: "congress", type: "number", allowed: "A Congress number.", example: "119" }],
    gotchas: [
      "Use this to find the EXACT spelling of a policy area before filtering `bills` by it. A near-miss returns zero bills and looks like an empty topic.",
      "Counts are precomputed and exact — do not recompute them by counting rows from `bills`.",
      "These counts are STAGE-BLIND. They cover every measure in the topic at any stage, including the ~96% still in committee. They CANNOT tell you how many became law. For that, fetch `bills` with policyArea and progressStage together and read its total — and pass limit 0, because the big topics (Health, Taxation, Armed Forces, International Affairs, Government Operations) have more measures than a normal fetch reads, and only the count-only path reaches all of them.",
      "Every bill has at most one policy area, so these counts sum to roughly the total measure count, not more.",
    ],
    notCovered: [
      "Sub-topics",
      "Trends over time within a Congress",
      "The richer legislative-subject list",
      "How far the measures in a topic got — use `bills` with policyArea plus progressStage",
    ],
    examples: ['{ "congress": 119 }'],
  },

  sponsors: {
    name: "sponsors",
    summary: "Members and how many bills each introduced, for one Congress.",
    grain: "One row per member per Congress, ordered by bill count.",
    fields: [
      { name: "sponsorName", type: "string", meaning: "Full 'First Last' name. Use verbatim in sponsorFilter." },
      { name: "billCount", type: "number", meaning: "Bills introduced in this Congress." },
      { name: "sponsorParty", type: "string", meaning: "'D', 'R' or 'I'." },
      { name: "sponsorState", type: "string", meaning: "Two-letter state." },
    ],
    filters: [
      { name: "congress", type: "number", allowed: "A Congress number.", example: "119" },
      { name: "sponsorState", type: "string", allowed: "Two-letter state code.", example: "MD" },
      { name: "sort", type: "string", allowed: "most_bills (default) or fewest_bills. REQUIRED for any 'fewest' question — the default page hides the bottom of the ranking.", example: "fewest_bills" },
    ],
    gotchas: [
      "Counts are of bills INTRODUCED, which is not a measure of influence or success. Do not present a high count as effectiveness.",
      "Reflects PRIMARY sponsorship only — a member who co-sponsors heavily but introduces little will look inactive here, and is not.",
      "There is NO name filter here — this dataset lists members, it does not look one up. To count what ONE named member introduced, fetch `bills` with sponsorFilter and limit 0. Being refused a name filter here says nothing about whether we hold that member; asked how many bills Monica De La Cruz introduced, the assistant tried this dataset, was refused, and told the reader it could not find out. She has 35.",
      "Use the exact sponsorName from this dataset in the `bills` sponsorFilter. Reformatting the name will match nothing.",
      "Before any 'most' or 'fewest' claim, check `complete` — and then check the ORDER, because a complete total does not make the page complete. Filtering by sponsorState reads that state's members directly, so the total is exact; but the rows are still one page of it, ordered most-first by default. California has 54 members and you see 50, so the fewest is NOT the last row you can see. For 'who introduced the fewest' pass sort 'fewest_bills'; for 'the most', 'most_bills'. Never read a minimum off a page.",
    ],
    notCovered: ["Committee membership", "Voting records", "Seniority, leadership roles, or district", "Co-sponsorship counts"],
    examples: [
      '{ "congress": 119 }',
      '{ "congress": 119, "sponsorState": "MD" }',
      '{ "congress": 119, "sponsorState": "CA", "sort": "fewest_bills" } — who introduced the fewest',
    ],
  },

  stats: {
    name: "stats",
    summary: "Exact precomputed totals per Congress: by stage, by chamber, and bills vs resolutions.",
    grain: "One row per Congress, or per Congress and chamber.",
    fields: [
      { name: "totalMeasures", type: "number", meaning: "All MEASURES in the Congress — bills AND resolutions. Not 'bills'." },
      { name: "houseMeasures", type: "number", meaning: "Measures originating in the House." },
      { name: "senateMeasures", type: "number", meaning: "Measures originating in the Senate." },
      { name: "stageCounts", type: "array", meaning: "Measures at each terminal stage. Whole-Congress on the unfiltered row; this chamber only on a chamber row." },
      { name: "chamberMeasures", type: "number", meaning: "Chamber rows only. Measures originating in that chamber." },
      { name: "partyCounts", type: "object", meaning: "Chamber rows only. Measures introduced by party." },
      { name: "partyLawCounts", type: "object", meaning: "Chamber rows only. Measures that BECAME LAW by party." },
      { name: "billsOnly", type: "number", meaning: "Measures that are BILLS (H.R. and S.) — what a reader means by 'how many bills'. Whole-Congress rows only." },
      { name: "jointResolutions", type: "number", meaning: "Joint resolutions, which can become law." },
      { name: "otherResolutions", type: "number", meaning: "Concurrent and simple resolutions, which never become law." },
      { name: "measuresByType", type: "object", meaning: "Count per type slug (hr, s, hjres, ...)." },
      { name: "scope", type: "string", meaning: "States in words what this row counts. Read it before quoting any number off the row." },
      { name: "dataLastSynced", type: "string", meaning: "ISO timestamp of the most recent change we pulled from Congress. This is how fresh our data is." },
      { name: "figuresLastRecomputed", type: "string", meaning: "ISO timestamp of when these precomputed totals were last rebuilt. Can lag dataLastSynced." },
    ],
    filters: [
      { name: "congress", type: "number", allowed: "A Congress number.", example: "119" },
      { name: "chamber", type: "string", allowed: "'house' or 'senate'. Omit for whole-Congress totals.", example: "house" },
    ],
    gotchas: [
      "These totals are authoritative and precomputed. NEVER estimate a count by fetching rows from `bills` and counting the rows you can see.",
      "EVERY NUMBER ON A ROW HAS THE SCOPE THAT ROW'S `scope` FIELD DESCRIBES, and nothing wider. A chamber row contains ONLY that chamber's figures. A whole-Congress row contains BOTH chambers' — its stage ladder is not the House's and not the Senate's. Reading a whole-Congress law count off a chamber-shaped question answered 'how many House bills became law' with 104 when the answer is 64.",
      "totalMeasures is MEASURES, not bills — it includes resolutions, which are not bills. When the reader asks how many BILLS, answer with billsOnly. Do not try to count hr and s from the `bills` dataset: there are far too many to read, so that comes back incomplete and you will end up with no answer at all.",
      "stageCounts are TERMINAL buckets, not milestones. The 'passed one chamber' figure excludes every measure that later became law. To answer 'how many did the Senate pass', use the `bills` dataset with reachedStage, not this ladder.",
      "On a chamber row, read the became-law figure straight off stageCounts. partyLawCounts is the same number split by party, and adding its parts up in front of the reader — 'the row shows 64, and 8+56 confirms it' — puts three numbers in one sentence where the answer is one. State the figure; do not show the arithmetic.",
      "The current Congress is still in progress, so its totals are a snapshot and will grow. Say so when comparing it to a finished Congress.",
      "This is the ONLY place that tells you how fresh our data is. If the reader asks how current it is, or whether something that happened recently is reflected, fetch this and quote dataLastSynced. Never guess at or promise a refresh interval.",
    ],
    notCovered: ["Per-member statistics", "Historical trends within a session", "Anything about individual bills"],
    examples: ['{ "congress": 119 }', '{ "congress": 119, "chamber": "house" }'],
  },
};

export const DATASET_NAMES = Object.keys(DATASETS) as DatasetName[];

export function isDatasetName(s: string): s is DatasetName {
  return Object.prototype.hasOwnProperty.call(DATASETS, s);
}

/**
 * The always-present index (spec §4.1). Sits in every system prompt, so it is
 * the one part of the catalog with a per-request cost — keep it terse. The
 * budget is enforced by datasets.test.ts.
 */
export function datasetIndex(): string {
  return DATASET_NAMES.map((n) => `  ${n.padEnd(15)} ${DATASETS[n].summary}`).join("\n");
}

/** Full field-level documentation, returned by the describe_dataset tool. */
export function describeDataset(name: DatasetName): string {
  const d = DATASETS[name];
  const lines: string[] = [
    `DATASET: ${d.name}`,
    `GRAIN: ${d.grain}`,
    "",
    "FIELDS",
    ...d.fields.map((f) => `  ${f.name} (${f.type}) — ${f.meaning}`),
    "",
    "FILTERS you may pass to fetch_dataset",
    ...d.filters.map(
      (f) =>
        `  ${f.name} (${f.type})` +
        (f.allowed ? ` — ${f.allowed}` : "") +
        (f.example ? ` e.g. ${f.example}` : ""),
    ),
    "",
    "IMPORTANT — these cause wrong answers if ignored",
    ...d.gotchas.map((g) => `  * ${g}`),
    "",
    "NOT IN THIS DATASET",
    ...d.notCovered.map((n) => `  - ${n}`),
    "",
    "EXAMPLE CALLS",
    ...d.examples.map((e) => `  ${e}`),
  ];
  return lines.join("\n");
}
