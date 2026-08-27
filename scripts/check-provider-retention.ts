/**
 * One-shot probe for spec §12.3.
 *
 * `data_collection: "deny"` and `zdr: true` are FILTERS — they narrow the
 * eligible provider set. Combined with our `only` provider pin they can
 * resolve to zero providers, which is a total chat outage. The public
 * endpoints API does not expose per-provider data policy, so the only way to
 * know is to ask.
 *
 * Re-run this whenever OPENROUTER_MODEL or OPENROUTER_PROVIDERS changes — a
 * model swap can silently change which providers qualify.
 *
 * Run: OPENROUTER_API_KEY=sk-or-... pnpm tsx scripts/check-provider-retention.ts
 */
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-0731";
const PROVIDERS = (process.env.OPENROUTER_PROVIDERS || "deepinfra")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function probe(label: string, provider: Record<string, unknown>) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
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
  console.log(`model=${MODEL} providers=${PROVIDERS.join(",")}\n`);

  await probe("baseline (pin only)", { only: PROVIDERS });
  await probe("pin + data_collection:deny", { only: PROVIDERS, data_collection: "deny" });
  await probe("pin + zdr", { only: PROVIDERS, zdr: true });
  const both = await probe("pin + deny + zdr  <-- the one that matters", {
    only: PROVIDERS,
    data_collection: "deny",
    zdr: true,
  });

  console.log("\n--- decision (spec §12.3) ---");
  if (!both.failed && PROVIDERS.includes(both.servedBy.toLowerCase())) {
    console.log("Ship both flags.");
  } else if (!both.failed) {
    console.log(`STOP. Routed to '${both.servedBy}', outside the US pin. Treat as failure.`);
  } else {
    console.log("STOP. No eligible provider. Surface the trade-off to the owner.");
    console.log("Do NOT silently drop either the US pin or the retention flags.");
  }
}

void main();
