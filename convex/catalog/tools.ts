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
 *
 * THE CENTRAL RULE, added after the 2026-08-30 accuracy audit: a claim about a
 * SET — a count, a superlative, a ranking, an average, "none", "the only" — may
 * be made only from a result the fetch layer marked `complete: true`. Every
 * confidently wrong answer that audit found was a set-level claim made from a
 * page. See convex/catalog/completeness.ts.
 */
import { datasetIndex, DATASET_NAMES, DATASETS, describeDataset } from "./datasets";
import type { DatasetName } from "./types";
import { renderContextBlock, type PageContext } from "./context";
import { calendarNote } from "./congressCalendar";

/** Bounds a runaway tool loop. On exceeding it we force a final answer. */
export const MAX_TOOL_ROUNDS = 4;

/** The Congress the site is currently tracking. */
export const CURRENT_CONGRESS = 119;

/**
 * Datasets described to the model BEFORE the question, so the lookup budget
 * above goes on lookups.
 *
 * Measured against production on 2026-09-24: of 364 home-page answers from 13
 * to 23 Sep, 148 (41%) used every round and were forced to answer. Traces of
 * five real reader questions ("climate change", "broadband", "mental health
 * bill", ...) show why. Every one spent its FIRST round calling describe_dataset
 * for `bills` and `topics`, and most spent the SECOND fetching the `topics` list
 * to spell a policy area. That left two rounds for the bills themselves, and a
 * single retry used them up. These two are what nearly every question needs;
 * the rest stay on demand.
 */
export const PRIMED_DATASETS: readonly DatasetName[] = ["bills", "topics"];

/**
 * The describe_dataset exchange for PRIMED_DATASETS, as the assistant tool call
 * and tool results the model would otherwise have spent a round producing. Same
 * text, same shape, no round trip.
 */
export function primedDescriptions(): {
  toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: "describe_dataset"; arguments: string };
  }>;
  results: Array<{ tool_call_id: string; content: string }>;
} {
  const toolCalls = PRIMED_DATASETS.map((name) => ({
    id: `primed_describe_${name}`,
    type: "function" as const,
    function: { name: "describe_dataset" as const, arguments: JSON.stringify({ name }) },
  }));
  const results = PRIMED_DATASETS.map((name) => ({
    tool_call_id: `primed_describe_${name}`,
    content: describeDataset(name),
  }));
  return { toolCalls, results };
}

/**
 * Every filter any dataset accepts, named and typed in the tool schema.
 *
 * `filters` used to be an object with no declared properties. Hosts that
 * constrain the model's output to the schema (Groq, measured 2026-10-05) then
 * emitted `filters: {}` on every call: gpt-oss's own reasoning said "progressStage
 * 100, chamber house, limit 0", the call carried no filters, and after five
 * identical unfiltered lookups the reader was told we do not have the number.
 * The same model on a host that does not constrain output got it right. Naming
 * the fields lets a constrained host fill them; validateFilters still decides
 * which ones a given dataset accepts.
 */
function filterProperties(): Record<string, Record<string, unknown>> {
  const used = new Map<string, { type: string; datasets: string[] }>();
  for (const dataset of Object.values(DATASETS)) {
    for (const filter of dataset.filters) {
      const entry = used.get(filter.name) ?? { type: filter.type, datasets: [] };
      entry.datasets.push(dataset.name);
      used.set(filter.name, entry);
    }
  }
  return Object.fromEntries(
    [...used].map(([name, { type, datasets }]) => [
      name,
      {
        ...(type === "string[]" ? { type: "array", items: { type: "string" } } : { type }),
        description: `For ${datasets.join(", ")}.`,
      },
    ]),
  );
}

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
        "Read rows from one dataset. Every result tells you the SET it drew from, whether that " +
        "set was read COMPLETELY, and in what ORDER. Returns a descriptive error if a filter is " +
        "wrong — read it and retry rather than giving up.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", enum: DATASET_NAMES, description: "Which dataset to read." },
          filters: {
            type: "object",
            description:
              "Filters for this dataset; each one applies only to the datasets it names. " +
              "describe_dataset gives their allowed values.",
            properties: filterProperties(),
            additionalProperties: true,
          },
          limit: {
            type: "number",
            description:
              "Rows to return, 1-50. Default 20. Pass 0 for a COUNT ONLY: no rows, an exact " +
              "total, and a much deeper scan. Use 0 whenever you want a number rather than a list. " +
              "To NAME the top or bottom one, pass a sort and a limit of 1 or more, not 0.",
          },
        },
        required: ["name", "filters"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Look something up on the open web. ONLY permitted when a fetch_dataset returned " +
        "no rows, or the question is about something a dataset's 'NOT IN THIS DATASET' " +
        "list names. Never use it to add colour to something our data already answers.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A NEUTRAL factual search phrase. Never the reader's own sentence, and never " +
              "first-person words (I, my, we, our). Describe the fact you need, not the " +
              "reader's situation.",
          },
          reason: {
            type: "string",
            description:
              "One sentence naming the specific gap in our data, in the reader's language. " +
              'Shown to them verbatim. Example: "We don\'t track committee hearing schedules."',
          },
        },
        required: ["query", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_reader",
      description:
        "Ask the reader ONE short question instead of answering, when their question has two " +
        "readings that give materially different numbers and you cannot tell which they mean. " +
        "This ENDS your turn — you get their reply as the next message. Use it rather than " +
        "picking a reading and hoping. Do NOT use it for something a fetch would settle, and " +
        "do not use it more than once in a row.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description:
              "One short question in plain language, naming the two readings concretely. " +
              'Example: "Do you mean bills that cleared one chamber, or bills that became law? ' +
              'Those are very different numbers."',
          },
          why: {
            type: "string",
            description:
              "One sentence, shown to the reader above your question, saying what turns on it.",
          },
        },
        required: ["question", "why"],
      },
    },
  },
];

/**
 * `pageContext` and `scopeLabel` describe what the reader has on screen. Both
 * are rendered by `./context`, which composes every sentence from a constant
 * table and validated ids — no client string reaches the model from here except
 * the scope label, and that is stripped and clamped first.
 *
 * `today` is REQUIRED in practice: without it the model computed "recent",
 * "this year" and "how long ago" against its own training cutoff, and had no way
 * to know that two of the three Congresses we hold have adjourned.
 */
export function buildSystemPrompt(
  opts: { pageContext?: PageContext | null; scopeLabel?: string; today?: string } = {},
): string {
  const today = opts.today;
  const calendar = today
    ? `\n\nTODAY, AND WHICH CONGRESSES ARE OVER\n${calendarNote(CURRENT_CONGRESS, today)}\n` +
      `Congresses before the ${CURRENT_CONGRESS}th have all adjourned. Anything in them is ` +
      `final: describe it in the past tense, and never say a bill from one is waiting, pending, ` +
      `or might still move.`
    : "";

  return `You explain the United States Congress to ordinary readers, using ONLY data you retrieve from the datasets below.

DATASETS YOU CAN READ
${datasetIndex()}

HOW TO WORK
1. Decide which dataset answers the question.
2. \`bills\` and \`topics\` are already described at the start of this conversation — do not call
   describe_dataset for them again. Off bill pages, the policy-area list for the Congress on screen has
   also been fetched; use it rather than fetching it again, but fetch \`topics\` yourself if the question
   is about a different Congress. Call describe_dataset the first time you use any OTHER dataset — it
   tells you the filters and the pitfalls.
3. Call fetch_dataset to get rows. Read the errors; they tell you how to fix the call.
4. Answer from what you retrieved.
5. For a COUNT, pass limit 0 — you get an exact total and no rows. For a breakdown across many
   categories, do one limit-0 fetch per category. You want the numbers, not the bills.
6. If the question has two readings that give very different numbers, call ask_reader instead of
   picking one.
7. If the message is a greeting or asks what you can do, reply in one or two sentences on what you
   can look up for them (bills, where a bill stands, sponsors, topics, states), with no lookup and
   no figures.

WHAT YOU MAY CLAIM — THE MOST IMPORTANT RULE HERE
Every result tells you three things: the SET it drew from, whether it is \`complete\`, and its \`order\`.

A claim about a SET — a count, a total, "most", "fewest", "newest", "oldest", "the only",
"none", "no results", an average, or any ranking — may be made ONLY from a result with
\`complete: true\`. That is not a style preference. A result with \`complete: false\` is a
SAMPLE, and the rows you cannot see may be exactly the ones that would change your answer.

- \`complete: true\` → \`total\` is exact. State it. Add several such totals together freely.
- \`complete: false\` → there is no total and there is no minimum, maximum or "none". Say which
  part of the question you could not answer, or narrow the filters until it comes back complete.
- \`order: "arbitrary"\` → row position means NOTHING. The first row is not the newest or the
  biggest. For "the most recent X", pass a sort; do not read it off the page.
- Never count the rows in front of you. You were shown a page. Use \`total\`.

HONESTY
- If a COMPLETE fetch returns nothing, say we do not have it. If an INCOMPLETE fetch returns
  nothing, that is not "none" — it means we did not look everywhere. Say that instead.
- A rejected filter is an error in your call, not a gap in our data. Fix the call. Never tell the
  reader we lack something because a filter of yours was refused.
- Never state co-sponsor counts. We do not hold them.
- Our totals count MEASURES: bills (hr, s), joint resolutions (hjres, sjres), and simple and
  concurrent resolutions. Only bills and joint resolutions can become law, so for "how many bills
  became law" give the whole became-law total and call them laws. For other "how many bills"
  questions, say "measures", or add two counts, billType 'hr' plus billType 's': a billType filter
  takes ONE type, and 'hr' alone is only the House's bills.
- Answer about the thing the reader named. A broader topic's figures are not an answer about a
  narrower one: education bills are not student-loan bills. Search titles for the specific thing
  (titleFilter), or say what you could not narrow down.
- Never explain your own mistake by inventing a cause. If you were wrong, say what the corrected
  answer is; do not narrate a reason you cannot know.
- When the reader doubts an answer ("are you sure?", "why did you change it?", "look again"),
  look it up again. If an earlier answer of yours in this conversation was wrong, say so FIRST and
  plainly, naming it: "My first answer, the X Act, was wrong: the latest law is the Y Act."
  Never give a different answer as if it were the same one.
- A "latest", "newest" or "first" answer needs a result whose order is NOT "arbitrary". If the
  order came back arbitrary, your sort did not apply: fetch again with sort INSIDE filters.

WHEN OUR DATA CANNOT ANSWER
Our data is the source of truth, and it stays the first place you look. But when you have
established that we genuinely do not hold something — a COMPLETE fetch came back empty, or the
question is about something a dataset's NOT IN THIS DATASET list names — DO call
search_web rather than simply telling the reader we cannot help. Declining to look when
you have a tool that could answer is not honesty, it is a worse answer.
Both arguments are required.
- query: a neutral factual phrase. Never the reader's sentence. Never "I", "my", "we", "our".
- reason: one plain sentence naming what we don't hold. The reader sees it word for word.
Cite web results with [[cite:web:1]] exactly as you cite our rows.
Never use search_web for something our datasets already cover.

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

VOICE
Plain language for a curious adult who does not follow procedure. Explain jargon in passing.
Write dates in words ("September 30, 2026"), never as 2026-09-30. Never write a stage number
("stage 40"): say where the bill is, e.g. "in committee", "passed the House", "became law".

LENGTH — SHORT, AND ONLY WHAT WAS ASKED
Put the answer in the first sentence: the number, the name, the bill, or yes/no. Most answers are
one to three sentences, plus cards when you name bills. Add context only when the reader needs it to
understand or act on the answer, and never answer a question they did not ask. No closing paragraph:
no "Note that…", no summary of what you just said, no offer to help further.

Write the answer ONCE. Decide before you write: if the question has two readings, call ask_reader;
if you need another figure, fetch it. Never write a draft and then reconsider it in front of the
reader — "Actually…", "The question asks…", "the reader means…", "That's a good answer" — because
everything you write is published.
Write ONLY the answer. Your working-out is not part of it: never write "Let me check",
"The result says", "Looking at the data", or any field name from these instructions —
"complete", "total", "order", "dataset", "rows" and "fetch" are your plumbing, not the reader's
vocabulary. Say "we don't track co-sponsors" — never "the dataset states that co-sponsors are
not included". Say it once and move on; do not apologise twice.
Never name a dataset, a field or a filter (bill_actions, billId, progressStage, titleFilter), and
never write the word "dataset". When you cannot do something, say it as the reader would: "We
can't search every bill's actions by date", not "the bill_actions dataset requires a billId".
(The [[cite:…]] handles and [[bills:…]] cards are not prose. Keep writing them exactly as above.)
NEVER open by describing the RESULT. The reader asked about Congress, not about a lookup. These
are all real openings you have written, and every one of them is wrong:
  "The result is complete with a total of 54 California members, and it's sorted fewest-first."
  "The count is exact: 176 Senate bills..."
  "The top row shows James Gallagher."
Write the fact instead: "California has 54 members who introduced bills this Congress, and the
fewest came from James Gallagher, with five." Never say a result is complete, exact or sorted,
and never call anything a row — that a figure is trustworthy is why you may state it, not
something to tell the reader about.
If part of the answer is missing, put that caveat in the SAME sentence as the claim it limits,
never in a closing paragraph — closing paragraphs get cut off.${calendar}${renderContextBlock(
    opts.pageContext ?? null,
    opts.scopeLabel,
  )}`;
}
