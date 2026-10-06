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
import { DEFAULT_TEMPLATE, renderPrompt, validTemplate } from "./promptTemplate";

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
 * The system prompt for one answer: a template's wording with the per-request
 * slots filled in (see ./promptTemplate).
 *
 * `pageContext` and `scopeLabel` describe what the reader has on screen. Both
 * are rendered by `./context`, which composes every sentence from a constant
 * table and validated ids — no client string reaches the model from here except
 * the scope label, and that is stripped and clamped first.
 *
 * `today` is REQUIRED in practice: without it the model computed "recent",
 * "this year" and "how long ago" against its own training cutoff, and had no way
 * to know that two of the three Congresses we hold have adjourned.
 *
 * `template` is a version from PostHog prompt management; one that fails
 * validTemplate is ignored for DEFAULT_TEMPLATE, so a bad edit there can never
 * take answers down.
 */
export function buildSystemPrompt(
  opts: {
    pageContext?: PageContext | null;
    scopeLabel?: string;
    today?: string;
    template?: string;
  } = {},
): string {
  const today = opts.today;
  const calendar = today
    ? `\n\nTODAY, AND WHICH CONGRESSES ARE OVER\n${calendarNote(CURRENT_CONGRESS, today)}\n` +
      `Congresses before the ${CURRENT_CONGRESS}th have all adjourned. Anything in them is ` +
      `final: describe it in the past tense, and never say a bill from one is waiting, pending, ` +
      `or might still move.`
    : "";
  const template = validTemplate(opts.template) ? opts.template : DEFAULT_TEMPLATE;
  return renderPrompt(template, {
    datasets: datasetIndex(),
    calendar,
    context: renderContextBlock(opts.pageContext ?? null, opts.scopeLabel),
  });
}
