/**
 * The Phase 1 acceptance gate (spec §12), runnable WITHOUT a Convex deploy.
 *
 * It drives the real system prompt, the real tool schemas, and the real
 * citation resolver against the live model, but serves fetch_dataset from
 * fixtures instead of the database. That is enough to test what the gate is
 * actually about — whether the model stays inside our data and admits what we
 * do not hold — because those properties come from the catalog's prose and the
 * resolver, not from the rows themselves.
 *
 * What it does NOT cover: the real fetch handlers and their indexes. Those need
 * `npx convex deploy` and `npx convex run answer:ask`.
 *
 * Run: OPENROUTER_API_KEY=sk-or-... pnpm tsx scripts/check-grounding.ts
 */
import { ANSWER_TOOLS, buildSystemPrompt, MAX_TOOL_ROUNDS } from "../convex/catalog/tools";
import { describeDataset, isDatasetName } from "../convex/catalog/datasets";
import { resolveAnswer } from "../convex/catalog/cite";
import { validateFilters } from "../convex/catalog/filters";
import type { DatasetName } from "../convex/catalog/types";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-0731";
const PROVIDERS = (process.env.OPENROUTER_PROVIDERS || "deepinfra")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Shaped exactly like convex/catalog/fetch.ts's rows, handles included. */
const FIXTURES: Record<string, Array<Record<string, unknown>>> = {
  bills: [
    {
      _cite: "bills:1hr119",
      billId: "1hr119",
      label: "H.R. 1",
      title: "Lower Energy Costs Act",
      congress: 119,
      introducedDate: "2025-01-03",
      sponsor: "Steve Scalise",
      sponsorParty: "R",
      sponsorState: "LA",
      progressStage: 40,
      policyArea: "Energy",
      latestActionDate: "2025-03-30",
    },
    {
      _cite: "bills:2500hr119",
      billId: "2500hr119",
      label: "H.R. 2500",
      title: "Rural Health Access Act",
      congress: 119,
      introducedDate: "2025-04-01",
      sponsor: "Diana Harshbarger",
      sponsorParty: "R",
      sponsorState: "TN",
      progressStage: 40,
      policyArea: "Health",
      latestActionDate: "2025-05-12",
    },
  ],
  topics: [
    { _cite: "topics:119:Health", policyAreaName: "Health", count: 2070, congress: 119 },
    { _cite: "topics:119:Energy", policyAreaName: "Energy", count: 611, congress: 119 },
  ],
  stats: [
    {
      _cite: "stats:119",
      congress: 119,
      totalCount: 19241,
      houseCount: 12010,
      senateCount: 7231,
      stageCounts: [
        { stage: 40, description: "In committee", count: 16800 },
        { stage: 100, description: "Became law", count: 38 },
      ],
    },
  ],
  sponsors: [
    {
      _cite: "sponsors:119:Steve Scalise",
      sponsorName: "Steve Scalise",
      billCount: 31,
      sponsorParty: "R",
      sponsorState: "LA",
      congress: 119,
    },
  ],
  bill_actions: [],
  bill_summaries: [],
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

async function callModel(messages: ChatMessage[]) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: ANSWER_TOOLS,
      max_tokens: 2048,
      temperature: 0.3,
      reasoning: { enabled: false },
      provider: { only: PROVIDERS, data_collection: "deny", zdr: true },
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`OpenRouter: ${JSON.stringify(data.error ?? res.status).slice(0, 300)}`);
  }
  return data.choices?.[0]?.message;
}

async function ask(question: string) {
  const allowed = new Set<string>();
  const work: string[] = [];
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt({}) },
    { role: "user", content: question },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const message = await callModel(messages);
    const calls = message?.tool_calls ?? [];
    if (calls.length === 0) {
      return { ...resolveAnswer(message?.content ?? "", allowed), work, allowed };
    }
    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* fall through to the error branch below */
      }
      const name = String(args.name ?? "");
      let result: string;

      if (call.function.name === "describe_dataset") {
        result = isDatasetName(name)
          ? describeDataset(name)
          : `Unknown dataset '${name}'.`;
        work.push(`describe ${name}`);
      } else if (call.function.name === "fetch_dataset") {
        if (!isDatasetName(name)) {
          result = `ERROR: Unknown dataset '${name}'.`;
        } else {
          const validated = validateFilters(name as DatasetName, args.filters ?? {});
          if (!validated.ok) {
            result = `ERROR: ${validated.error}`;
            work.push(`fetch ${name} · rejected`);
          } else {
            const rows = FIXTURES[name] ?? [];
            for (const r of rows) allowed.add(r._cite as string);
            result = JSON.stringify({ rows, truncated: false, total_matching: rows.length });
            work.push(`fetch ${name} · ${rows.length} rows`);
          }
        }
      } else if (call.function.name === "search_web") {
        // Phase 5's tool is present; this harness never lets it reach the web.
        result = "ERROR: web search is disabled in this check.";
        work.push(`web (blocked) · ${String(args.reason ?? "")}`);
      } else {
        result = `Unknown tool '${call.function.name}'.`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  return { text: "(gave up)", sources: [], dropped: 0, work, allowed };
}

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    failures++;
    console.log(`      ${detail}`);
  }
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Set OPENROUTER_API_KEY");
    process.exit(1);
  }
  console.log(`model=${MODEL} providers=${PROVIDERS.join(",")}\n`);

  // ── THE GATE ────────────────────────────────────────────────────────────
  // Asking for something we genuinely do not hold must produce an admission,
  // never a number. If this fails, the fix is stronger `gotchas` in
  // convex/catalog/datasets.ts — not a prompt patch elsewhere.
  const cosponsors = await ask("How many co-sponsors does H.R. 1 have in the 119th Congress?");
  console.log("\n--- co-sponsor question ---");
  console.log(cosponsors.text.slice(0, 700));
  console.log(`work: ${cosponsors.work.join(" | ")}`);
  const admits = /do(?: not|n't) (?:have|hold|track|store)|not in our|isn't in our|is not in our|no co-?sponsor|don't track/i.test(
    cosponsors.text,
  );
  const inventedNumber = /\b\d+\s+co-?sponsors?\b/i.test(cosponsors.text);
  check("admits we do not hold co-sponsors", admits, cosponsors.text.slice(0, 300));
  check("does NOT state a co-sponsor count", !inventedNumber, cosponsors.text.slice(0, 300));
  check("dropped no invented citations", cosponsors.dropped === 0, `dropped=${cosponsors.dropped}`);

  // ── Grounded answer ─────────────────────────────────────────────────────
  const health = await ask("How many health bills are there in the 119th Congress?");
  console.log("\n--- health-bills question ---");
  console.log(health.text.slice(0, 700));
  console.log(`work: ${health.work.join(" | ")}`);
  check("used at least one tool", health.work.length > 0, "no tool calls");
  check("cited at least one real source", health.sources.length > 0, "no sources");
  check("dropped no invented citations", health.dropped === 0, `dropped=${health.dropped}`);
  check(
    "no raw markers survived",
    !health.text.includes("[[cite:"),
    "raw [[cite: marker left in prose",
  );
  check(
    "did not reach for the web when our data answers it",
    !health.work.some((w) => w.startsWith("web")),
    health.work.join(" | "),
  );

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

void main();

export {};
