/**
 * Spec §12.1. Does a web-plugin request against our PINNED model and providers
 * return url_citation annotations we can extract?
 *
 * If not, the fallback is to call the search engine's API directly and mint
 * web:N handles ourselves — same reader-facing behaviour, same citation
 * mechanism. So this determines implementation, not feasibility.
 *
 * Run: OPENROUTER_API_KEY=sk-or-... pnpm tsx scripts/check-web-citations.ts
 */
/**
 * The shipped defaults, copied from convex/answer.ts and overridden by the same
 * environment variables. No fallback models: production's web search sends
 * none, because it parses provider-specific citation annotations.
 * scripts/check-grounding.test.ts fails if these drift from convex/answer.ts.
 */
const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-0731";
const PROVIDERS = (process.env.OPENROUTER_PROVIDERS || "deepinfra,amazon-bedrock")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_PRICE = { prompt: 0.2, completion: 0.4 };

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Set OPENROUTER_API_KEY");
    process.exit(1);
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "user", content: "US House Ways and Means Committee hearing schedule 2026" },
      ],
      max_tokens: 512,
      plugins: [{ id: "web", engine: "exa", max_results: 5 }],
      provider: {
        ...(PROVIDERS.length > 0 && { only: PROVIDERS }),
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

