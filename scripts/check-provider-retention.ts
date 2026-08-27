/**
 * One-shot probe for spec §12.3.
 *
 * `data_collection: "deny"` and `zdr: true` are FILTERS — they narrow the
 * eligible provider set. Combined with our `only` provider pin they can
 * resolve to zero providers, which is a total chat outage. The public
 * endpoints API does not expose per-provider data policy, so the only way to
 * know is to ask.
 *
 * Re-run this whenever OPENROUTER_MODEL, OPENROUTER_PROVIDERS or
 * OPENROUTER_FALLBACK_MODELS changes — a model swap can silently change which
 * providers qualify.
 *
 * Defaults here MUST track the shipped defaults in convex/llm.ts and
 * convex/answer.ts. Both files tell maintainers to re-run this probe, so a
 * stale default here would validate a narrower config than we actually ship
 * and quietly bless something that was never tested.
 *
 * Every model in the failover chain is probed, not just the primary: a
 * fallback that fails the retention filters is silently unreachable rather
 * than loudly broken, so it has to be checked before it is relied on.
 *
 * Run: OPENROUTER_API_KEY=sk-or-... pnpm tsx scripts/check-provider-retention.ts
 */
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-0731";
const PROVIDERS = (process.env.OPENROUTER_PROVIDERS || "deepinfra,amazon-bedrock")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/** Blank disables fallbacks, matching the runtime's `??` semantics. */
const FALLBACKS = (
  process.env.OPENROUTER_FALLBACK_MODELS ??
  "deepseek/deepseek-v4-flash,amazon/nova-lite-v1"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * OpenRouter reports a display name ("Amazon Bedrock"); the pin uses a slug
 * ("amazon-bedrock"). Comparing them without normalising makes every
 * multi-word provider look like it routed outside the pin.
 */
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

async function probe(
  model: string,
  label: string,
  provider: Record<string, unknown>,
) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      max_tokens: 8,
      provider,
    }),
  });
  const data = await res.json().catch(() => ({}));
  const servedBy = typeof data.provider === "string" ? data.provider : "(none)";
  const failed = !res.ok || Boolean(data.error);
  console.log(
    `${failed ? "FAIL" : "PASS"}  ${label.padEnd(34)} served_by=${servedBy}` +
      (failed ? `\n      ${JSON.stringify(data.error ?? res.status).slice(0, 300)}` : ""),
  );
  return { failed, servedBy };
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Set OPENROUTER_API_KEY (Convex dashboard → Settings → Environment Variables)");
    process.exit(1);
  }
  console.log(`providers=${PROVIDERS.join(",")}`);
  console.log(`chain=${[MODEL, ...FALLBACKS].join(" -> ")}\n`);

  const verdicts: Array<{ model: string; ok: boolean; servedBy: string }> = [];
  for (const [i, model] of [MODEL, ...FALLBACKS].entries()) {
    console.log(`--- ${i === 0 ? "PRIMARY" : `FALLBACK ${i}`}: ${model} ---`);
    await probe(model, "baseline (pin only)", { only: PROVIDERS });
    await probe(model, "pin + data_collection:deny", {
      only: PROVIDERS,
      data_collection: "deny",
    });
    await probe(model, "pin + zdr", { only: PROVIDERS, zdr: true });
    const both = await probe(model, "pin + deny + zdr  <-- the one that matters", {
      only: PROVIDERS,
      data_collection: "deny",
      zdr: true,
    });
    verdicts.push({
      model,
      ok: !both.failed && PROVIDERS.includes(toSlug(both.servedBy)),
      servedBy: both.servedBy,
    });
    console.log("");
  }

  console.log("--- decision (spec §12.3) ---");
  for (const v of verdicts) {
    if (v.ok) console.log(`  OK        ${v.model}  (served by ${v.servedBy})`);
    else if (v.servedBy !== "(none)")
      console.log(`  OUTSIDE   ${v.model}  routed to '${v.servedBy}', not in the pin`);
    else console.log(`  NO PROVIDER  ${v.model}`);
  }
  const primary = verdicts[0];
  const badFallbacks = verdicts.slice(1).filter((v) => !v.ok);
  if (!primary.ok) {
    console.log("\nSTOP. The PRIMARY has no eligible provider — that is an outage.");
    console.log("Do NOT silently drop either the US pin or the retention flags.");
  } else if (badFallbacks.length > 0) {
    console.log(
      `\nPrimary is fine, but ${badFallbacks.length} fallback(s) are unreachable and would be skipped silently.`,
    );
    console.log("Fix or remove them — an unreachable fallback is not a fallback.");
  } else {
    console.log("\nShip both flags. Every model in the chain is reachable.");
  }
}

void main();

// Marks this file as a module so its top-level consts are scoped to it —
// otherwise every script in this directory shares one global namespace and
// two probes declaring `MODEL` collide at build time.
export {};

