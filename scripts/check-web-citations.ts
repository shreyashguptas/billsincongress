/**
 * Spec §12.1. Does the web lookup return sources we can show the reader?
 *
 * 1. CLAUDE (the default, convex/claude.ts): runs production's own
 *    searchWebClaude — Claude Sonnet 5.5 with Anthropic's web search tool, US
 *    inference — and prints the sources it built from Claude's citations.
 * 2. OPENROUTER (the fallback): a web-plugin request against our PINNED model
 *    and providers, checking for url_citation annotations we can extract.
 *
 * Run: ANTHROPIC_API_KEY=sk-ant-... OPENROUTER_API_KEY=sk-or-... pnpm tsx scripts/check-web-citations.ts
 * (either key alone checks that path alone). Pass queries as arguments to try
 * your own; the Claude path runs each and prints what it cost and how long it
 * took, and every excerpt in full, so a cut-off quote is visible. With
 * WEB_CHECK_DUMP=<file>, Claude's raw replies are saved there too, so the
 * excerpt code can be worked on against real pages without paying again.
 */
import { writeFileSync } from "node:fs";
import { claudeEffort, claudeWebModel, CUT_OFF, searchWebClaude } from "../convex/claude";
import type { AnswerTrace, GenerationRecord } from "../convex/aiTrace";
import { reasoningConfig } from "../convex/reasoning";

const QUERY = "US House Ways and Means Committee hearing schedule 2026";
/**
 * The lookups behind the answers the fact-check judge failed between
 * 2026-10-23 and 26, reworded as the answer model words a search: each one's
 * excerpts stopped mid-sentence and the answer finished the sentence.
 */
const FAILED_LOOKUPS = [
  "H.R. 10861 119th Congress covered cellular modules Department of Defense audit",
  "bill task force AI speech-to-text federal courts 2026",
  "Romance Scam Prevention Act H.R. 2481 constitutional authority statement",
  "bill exclude veterans disability benefits chapters 11 and 15 of title 38 from income 2026",
];
const QUERIES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [QUERY, ...FAILED_LOOKUPS];
/**
 * The shipped defaults, copied from convex/answer.ts and overridden by the same
 * environment variables. No fallback models: production's web search sends
 * none, because it parses provider-specific citation annotations.
 * scripts/check-grounding.test.ts fails if these drift from convex/answer.ts.
 */
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b";
const PROVIDERS = (process.env.OPENROUTER_PROVIDERS || "cerebras,groq,amazon-bedrock")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_PRICE = { prompt: 0.5, completion: 1.0 };

/** Claude's raw replies, kept for WEB_CHECK_DUMP. */
const replies: unknown[] = [];

/** Production's Claude web lookup, called as answer.ts calls it. */
async function checkClaude() {
  if (process.env.WEB_CHECK_DUMP) {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const response = await realFetch(input, init);
      if (String(input instanceof Request ? input.url : input).includes("api.anthropic.com")) {
        replies.push(await response.clone().json().catch(() => null));
      }
      return response;
    };
  }
  const model = claudeWebModel();
  if (!model) {
    console.log("CLAUDE: ANTHROPIC_WEB_MODEL is blank, so production searches through Exa only.\n");
    return;
  }
  let totalUsd = 0;
  for (const query of QUERIES) {
    // The generation production would record: latency, tokens, cost, fetches.
    let record: Partial<GenerationRecord> = {};
    const trace = { generation: (g: GenerationRecord) => (record = g) } as unknown as AnswerTrace;
    try {
      const hits = await searchWebClaude({
        apiKey: process.env.ANTHROPIC_API_KEY ?? "",
        model,
        query,
        maxResults: 5,
        // The effort production's web lookup uses (OPENROUTER_REASONING, or the default).
        effort: claudeEffort(reasoningConfig(process.env.OPENROUTER_REASONING)),
        trace,
      });
      totalUsd += record.costUsd ?? 0;
      const cut = hits.filter((h) => h.excerpt.includes(CUT_OFF)).length;
      console.log(`CLAUDE ${model}: "${query}"`);
      console.log(
        `  ${((record.latencyMs ?? 0) / 1000).toFixed(1)} s, ${record.webSearchRequests ?? 0} search(es), ` +
          `${record.webFetchRequests ?? 0} page(s) read, $${(record.costUsd ?? 0).toFixed(3)}, ` +
          `${hits.length} source(s), ${cut} with a cut-off excerpt`,
      );
      for (const h of hits) console.log(`  - ${h.title || "(no title)"} <${h.url}>\n    ${h.excerpt}`);
      console.log(hits.every((h) => h.excerpt.trim().length > 0) ? "PASS\n" : "WARN: a source has no excerpt\n");
    } catch (error) {
      console.log(`CLAUDE ${model}: "${query}"\nFAIL: ${String(error).slice(0, 400)}`);
      console.log("-> production falls back to the Exa path for this lookup.\n");
    }
  }
  console.log(`CLAUDE total: $${totalUsd.toFixed(3)} for ${QUERIES.length} lookup(s)\n`);
  if (process.env.WEB_CHECK_DUMP) {
    writeFileSync(process.env.WEB_CHECK_DUMP, JSON.stringify(replies));
    console.log(`Raw replies saved to ${process.env.WEB_CHECK_DUMP}\n`);
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY and/or OPENROUTER_API_KEY");
    process.exit(1);
  }
  if (process.env.ANTHROPIC_API_KEY) await checkClaude();
  if (!process.env.OPENROUTER_API_KEY) return;
  console.log("OPENROUTER (Exa fallback):");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "user", content: QUERY },
      ],
      max_tokens: 512,
      plugins: [{ id: "web", engine: "exa", max_results: 5 }],
      provider: {
        ...(PROVIDERS.length > 0 && { only: PROVIDERS, order: PROVIDERS }),
        max_price: MAX_PRICE,
        data_collection: "deny",
        zdr: true,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    console.log("FAIL: request rejected");
    console.log(JSON.stringify(data.error ?? res.status).slice(0, 600));
    console.log("\n-> Fall back to calling the search API directly (spec §12.1).");
    return;
  }

  const message = data.choices?.[0]?.message ?? {};
  const annotations = message.annotations ?? [];
  const citations = annotations.filter((a: { type?: string }) => a?.type === "url_citation");

  console.log(`served_by      = ${data.provider ?? "(none)"}`);
  console.log(`annotations    = ${annotations.length}`);
  console.log(`url_citations  = ${citations.length}`);
  if (citations.length > 0) {
    console.log("\nfirst citation:");
    console.log(JSON.stringify(citations[0], null, 2).slice(0, 800));
    console.log("\nPASS -> extract from message.annotations.");
  } else {
    console.log("\nFAIL -> no citations. Call the search API directly (spec §12.1).");
  }
}

void main();

// Marks this file as a module so its top-level consts are scoped to it —
// otherwise every script in this directory shares one global namespace and
// two probes declaring `MODEL` collide at build time.
export {};

