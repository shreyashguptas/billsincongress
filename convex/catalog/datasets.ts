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
      { name: "latestActionDate", type: "string", meaning: "ISO date of the most recent action." },
    ],
    filters: [
      { name: "congress", type: "number", allowed: "A Congress number.", example: "119" },
      { name: "titleFilter", type: "string", allowed: "Words to match in the TITLE only.", example: "veterans housing" },
      { name: "policyArea", type: "string", allowed: "Use the `topics` dataset to find exact names.", example: "Health" },
      { name: "progressStage", type: "number", allowed: "20, 40, 60, 80, 85, 90, 95 or 100.", example: "40" },
      { name: "sponsorState", type: "string", allowed: "Two-letter state code.", example: "MD" },
      { name: "sponsorFilter", type: "string[]", allowed: "Exact 'First Last' names. Use `sponsors` to find them.", example: '["John Sarbanes"]' },
      { name: "chamber", type: "string", allowed: "'house' or 'senate'.", example: "senate" },
      { name: "billType", type: "string", allowed: "'hr', 's', 'hjres', 'sjres', etc.", example: "hr" },
      { name: "billNumber", type: "string", allowed: "Number within its type.", example: "1234" },
    ],
    gotchas: [
      "progressStage is a STAGE CODE, one of 20/40/60/80/85/90/95/100. It is NOT a percentage and NOT a probability of passing. 20=introduced, 40=in committee, 60=passed one chamber, 80=passed both, 85=vetoed, 90=to president, 95=signed, 100=became law. 85 sits off the main path: a vetoed bill reached the President and stopped there — it did not advance to 90 or 95.",
      "We store only the PRIMARY sponsor. Co-sponsors are not in our data at all — never state or imply how many co-sponsors a bill has.",
      "titleFilter searches BILL TITLES ONLY, never the text of the bill. A bill about a subject whose title does not mention it will not be found this way. Prefer policyArea for subject questions.",
      "policyAreaName is ONE policy area per bill. Bills also carry a much richer list of legislative subjects, which this dataset does not expose.",
      "Most bills never leave committee. A bill at stage 40 is in the normal case, not a stalled one — do not describe it as stalled or failing.",
      "A bill missing from a Congress is not proof it does not exist. Congresses before the earliest synced one are simply not loaded.",
      "NEVER report a count of bills from this dataset as a total. It returns a capped page. If a result carries total_is_at_least, say 'at least N' — never a bare N. For real totals use the `stats` and `topics` datasets.",
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
      '{ "congress": 119, "policyArea": "Health", "progressStage": 40 }',
      '{ "congress": 119, "sponsorState": "MD" }',
      '{ "congress": 119, "billType": "hr", "billNumber": "1" }',
    ],
  },

  bill_actions: {
    name: "bill_actions",
    summary: "Dated timeline of every step a bill has taken.",
    grain: "One row per recorded action on one bill, oldest first.",
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
      "Every bill has at most one policy area, so these counts sum to roughly the total bill count, not more.",
    ],
    notCovered: ["Sub-topics", "Trends over time within a Congress", "The richer legislative-subject list"],
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
    ],
    gotchas: [
      "Counts are of bills INTRODUCED, which is not a measure of influence or success. Do not present a high count as effectiveness.",
      "Reflects PRIMARY sponsorship only — a member who co-sponsors heavily but introduces little will look inactive here, and is not.",
      "Use the exact sponsorName from this dataset in the `bills` sponsorFilter. Reformatting the name will match nothing.",
    ],
    notCovered: ["Committee membership", "Voting records", "Seniority, leadership roles, or district", "Co-sponsorship counts"],
    examples: ['{ "congress": 119 }', '{ "congress": 119, "sponsorState": "MD" }'],
  },

  stats: {
    name: "stats",
    summary: "Precomputed totals by Congress, chamber and stage.",
    grain: "One row per Congress, or per Congress and chamber.",
    fields: [
      { name: "totalCount", type: "number", meaning: "All bills in the Congress." },
      { name: "houseCount", type: "number", meaning: "Bills originating in the House." },
      { name: "senateCount", type: "number", meaning: "Bills originating in the Senate." },
      { name: "stageCounts", type: "array", meaning: "Count of bills at each stage code, with its description." },
      { name: "partyCounts", type: "object", meaning: "Bills introduced by party, per chamber." },
      { name: "partyLawCounts", type: "object", meaning: "Bills that BECAME LAW by party, per chamber." },
    ],
    filters: [
      { name: "congress", type: "number", allowed: "A Congress number.", example: "119" },
      { name: "chamber", type: "string", allowed: "'house' or 'senate'. Omit for whole-Congress totals.", example: "house" },
    ],
    gotchas: [
      "These totals are authoritative and precomputed. NEVER estimate a count by fetching rows from `bills` and counting them — `bills` returns a capped page, so counting it will understate the real number badly.",
      "partyLawCounts is bills that became law, a very small number. Do not confuse it with partyCounts.",
      "The current Congress is still in progress, so its totals are a snapshot and will grow. Say so when comparing it to a finished Congress.",
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
