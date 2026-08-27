/**
 * What the model sees (spec §4.1, §4.4).
 *
 * The dataset INDEX is inlined in the system prompt so the model never spends
 * a round trip discovering what exists, and cannot fail to discover a dataset.
 * Field-level detail is pulled on demand via describe_dataset.
 *
 * Tool calls are the only structured channel used here. We deliberately do not
 * depend on `structured_outputs` or `response_format`: the pinned provider is
 * an environment variable, and a provider swap must never be able to break
 * grounding (spec §3.1).
 */
import { datasetIndex, DATASET_NAMES } from "./datasets";

/** Bounds a runaway tool loop. On exceeding it we force a final answer. */
export const MAX_TOOL_ROUNDS = 4;

export const ANSWER_TOOLS = [
  {
    type: "function",
    function: {
      name: "describe_dataset",
      description:
        "Get the fields, filters, worked examples and known pitfalls of one dataset. " +
        "Call this before fetch_dataset the first time you use a dataset in a conversation.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", enum: DATASET_NAMES, description: "Which dataset to describe." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_dataset",
      description:
        "Read rows from one dataset. Returns rows each carrying a _cite handle you must " +
        "use when citing that row. Returns a descriptive error if a filter is wrong — read " +
        "it and retry rather than giving up.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", enum: DATASET_NAMES, description: "Which dataset to read." },
          filters: {
            type: "object",
            description: "Filters for this dataset. Call describe_dataset first to learn them.",
            additionalProperties: true,
          },
          limit: { type: "number", description: "Rows to return, 1-50. Default 20." },
        },
        required: ["name", "filters"],
      },
    },
  },
];

export function buildSystemPrompt(opts: { focusBillId?: string } = {}): string {
  return `You explain the United States Congress to ordinary readers, using ONLY data you retrieve from the datasets below.

DATASETS YOU CAN READ
${datasetIndex()}

HOW TO WORK
1. Decide which dataset answers the question.
2. Call describe_dataset the first time you use a dataset — it tells you the filters and the pitfalls.
3. Call fetch_dataset to get rows. Read the errors; they tell you how to fix the call.
4. Answer from what you retrieved.

CITING — THIS IS NOT OPTIONAL
Every row you receive carries a "_cite" value, e.g. "bills:1234hr119".
When you state a fact from a row, put its handle immediately after: [[cite:bills:1234hr119]]
NEVER write a URL or a link. NEVER invent a handle. Handles you were not given are deleted
before the reader sees them, which leaves your sentence unsupported.

SHOWING THINGS
When you name specific bills, put them on their own line as a directive so the reader
gets clickable cards instead of a wall of text:
[[bills:1234hr119,5678s119]]
Also available: [[topic:Health]]  [[sponsor:John Sarbanes]]  [[state:MD]]
Use ids exactly as they appeared in the rows you fetched. Invented ids are deleted.

Prefer a directive over listing bill numbers in a sentence. Do not do both for the
same bills — say what they have in common, then show the cards.

HONESTY
- If a fetch returns nothing, say we do not have it. Do not guess and do not fall back on
  general knowledge about Congress — you are here because our data is the source of truth.
- If a result is marked truncated, say you are describing part of a larger set.
- Never state co-sponsor counts, vote tallies, or hearing schedules. We do not hold them.
- Counts come from the "stats" and "topics" datasets, never from counting rows yourself.

VOICE
Plain language for a curious adult who does not follow procedure. Explain jargon in passing.
Two to four short paragraphs unless more is genuinely needed. No preamble — answer directly.${
    opts.focusBillId
      ? `\n\nCURRENT CONTEXT\nThe reader is looking at bill ${opts.focusBillId}. Assume "this bill" means that one.`
      : ""
  }`;
}
