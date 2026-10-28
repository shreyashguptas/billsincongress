/**
 * One-shot probe for spec §12.3, for both providers the answer engine uses.
 *
 * CLAUDE (convex/claude.ts, on our own key). Each Claude model the answer
 * chain and the web lookup would call is asked one tiny question exactly as
 * production asks: `inference_geo: "us"`. PASS needs the request to succeed,
 * Anthropic to report `usage.inference_geo` "us" (the owner's rule: AI on US
 * servers only), and the model to have a price in claudePrices() (otherwise
 * production refuses to call it). Anthropic's retention terms are account-level,
 * not per request, so there is nothing to probe for them here.
 *
 * OPENROUTER (gpt-oss, the last resort, and the Exa web fallback).
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
 * Defaults here MUST track the shipped defaults in convex/answer.ts, which
 * tells maintainers to re-run this probe, so a
 * stale default here would validate a narrower config than we actually ship
 * and quietly bless something that was never tested.
 *
 * Every model in the failover chain is probed, not just the primary: a
 * fallback that fails the retention filters is silently unreachable rather
 * than loudly broken, so it has to be checked before it is relied on.
 *
 * Run: ANTHROPIC_API_KEY=sk-ant-... OPENROUTER_API_KEY=sk-or-... pnpm tsx scripts/check-provider-retention.ts
 * (either key alone probes that provider alone).
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_BASE_URL,
  claudePrices,
  claudeAnswerModels,
  claudeWebModels,
  INFERENCE_GEO,
} from "../convex/claude";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b";
const PROVIDERS = (process.env.OPENROUTER_PROVIDERS || "cerebras,groq,amazon-bedrock")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/** Blank disables fallbacks, matching the runtime's `??` semantics. */
const FALLBACKS = (
  process.env.OPENROUTER_FALLBACK_MODELS ??
  ""
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

/** One Claude model, asked the way production asks. */
async function probeClaude(model: string): Promise<boolean> {
  const priced = model in claudePrices();
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: ANTHROPIC_BASE_URL });
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      inference_geo: INFERENCE_GEO,
    });
    const geo = response.usage.inference_geo ?? "(not reported)";
    const ok = geo === INFERENCE_GEO && priced;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${model.padEnd(24)} inference_geo=${geo} priced=${priced} served_by=${response.model}`,
    );
    return ok;
  } catch (error) {
    console.log(`FAIL  ${model.padEnd(24)} ${String(error).slice(0, 300)}`);
    return false;
  }
}

async function main() {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  if (!hasAnthropic && !hasOpenRouter) {
    console.error(
      "Set ANTHROPIC_API_KEY and/or OPENROUTER_API_KEY (Convex dashboard → Settings → Environment Variables)",
    );
    process.exit(1);
  }
  if (hasAnthropic) {
    const models = [...new Set([...claudeAnswerModels(), ...claudeWebModels()].filter(Boolean))];
    console.log(`--- CLAUDE (US inference): ${models.join(", ") || "(all switched off)"} ---`);
    let allOk = true;
    for (const model of models) allOk = (await probeClaude(model)) && allOk;
    console.log(
      allOk
        ? "\nEvery Claude model in the chain answers on US servers and has a price on file.\n"
        : "\nSTOP. A Claude model above failed: production skips it and moves down the chain.\n",
    );
  } else {
    console.log("(ANTHROPIC_API_KEY not set: Claude not probed)\n");
  }
  if (!hasOpenRouter) {
    console.log("(OPENROUTER_API_KEY not set: the last resort and the Exa fallback not probed)");
    return;
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

