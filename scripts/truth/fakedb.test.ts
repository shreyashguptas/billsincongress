/**
 * Fidelity tests for the local Convex stand-in.
 *
 * THE POINT OF THIS FILE: a fake database that is subtly wrong would let every
 * handler test pass while production stayed broken — the worst possible outcome,
 * because it would look like proof. So before the fake is used to verify any fix,
 * it must reproduce production's KNOWN WRONG NUMBERS exactly.
 *
 * The numbers asserted below were measured against production Convex on
 * 2026-08-30 by running the real `catalog/fetch:fetchDataset` query:
 *   {policyArea:"Health", progressStage:100}  -> count 0   (truth: 1)
 *   {progressStage:100}                       -> count 104 (truth: 104)
 *   sponsors {sponsorState:"CA"}              -> count 29  (truth: 54)
 * If this file goes red, the fake has drifted from Convex and nothing that
 * depends on it can be believed.
 *
 * Skips cleanly when .truth-cache/ is absent, so `pnpm test` stays hermetic.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CACHE_MISSING_MESSAGE,
  TRUTH_CACHE_SKIP_EXIT,
  cacheAvailable,
  truthCacheRequired,
  compareValues,
  loadFakeCtx,
  parseSchema,
} from "./fakedb";

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void | Promise<void>) {
  const record = (err: unknown) =>
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`,
    );
  try {
    const out = fn();
    if (out instanceof Promise) return out.then(() => void passed++, record);
    passed++;
  } catch (err) {
    record(err);
  }
  return Promise.resolve();
}

async function main() {
  // --- schema parsing works without the data cache -------------------------
  const schema = parseSchema(readFileSync("convex/schema.ts", "utf8"));

  await it("parses the bills indexes out of the real schema", () => {
    const bills = schema.indexes.bills;
    assert.ok(bills, "no bills table parsed from convex/schema.ts");
    assert.deepEqual(bills.by_billId, ["billId"]);
    assert.deepEqual(bills.by_congress_and_policy_area, ["congress", "policyAreaName"]);
    assert.deepEqual(bills.by_congress_and_progress_stage, ["congress", "progressStage"]);
  });

  await it("parses the title search index and its filter fields", () => {
    const s = schema.searchIndexes.bills?.search_title;
    assert.ok(s, "search_title not parsed");
    assert.equal(s.searchField, "title");
    assert.ok(s.filterFields.includes("congress"));
    assert.ok(s.filterFields.includes("progressStage"));
  });

  await it("orders values the way Convex does: undefined before numbers", () => {
    // progressStage is optional. Rows missing it sort before every stage code,
    // which is what makes a range read over that index correct.
    assert.ok(compareValues(undefined, 20) < 0);
    assert.ok(compareValues(null, 20) < 0);
    assert.ok(compareValues(20, 40) < 0);
    assert.ok(compareValues("2025-01-01", "2026-01-01") < 0);
    assert.equal(compareValues(40, 40), 0);
  });

  if (!cacheAvailable()) {
    if (truthCacheRequired()) {
      console.error("REQUIRE_TRUTH_CACHE=1 but no .truth-cache/ — refusing to pass without running.");
      process.exit(1);
    }
    console.log(`fakedb.test.ts — ${passed} passed (schema only)`);
    console.log(CACHE_MISSING_MESSAGE);
    process.exit(TRUTH_CACHE_SKIP_EXIT);
  }

  const ctx = loadFakeCtx();
  const bills = ctx.db.rowsOf("bills");

  await it("loaded a plausible copy of production", () => {
    assert.ok(bills.length > 50000, `only ${bills.length} bills loaded`);
    assert.ok(
      ctx.db.rowsOf("congressSponsors").length > 1000,
      "congressSponsors looks empty",
    );
  });

  // --- the fake must reproduce production's WRONG numbers ------------------

  await it("reproduces production: the Health topic window is capped at 200", async () => {
    const window = await ctx.db
      .query("bills")
      .withIndex("by_congress_and_policy_area", (q: any) =>
        q.eq("congress", 119).eq("policyAreaName", "Health"),
      )
      .order("desc")
      .take(200);
    assert.equal(window.length, 200, "the scan window should fill for a big topic");
    const lawsInWindow = window.filter((r: any) => r.progressStage === 100).length;
    assert.equal(
      lawsInWindow,
      0,
      "production returns 0 Health laws from this window; the fake must agree",
    );
  });

  await it("reproduces production: the true Health law count is not zero", () => {
    const truth = bills.filter(
      (r: any) => r.congress === 119 && r.policyAreaName === "Health" && r.progressStage === 100,
    ).length;
    assert.ok(truth > 0, "there really are Health laws; the window simply cannot see them");
  });

  await it("reproduces production: 104 laws in the 119th, and the window sees all of them", async () => {
    const window = await ctx.db
      .query("bills")
      .withIndex("by_congress_and_progress_stage", (q: any) =>
        q.eq("congress", 119).eq("progressStage", 100),
      )
      .order("desc")
      .take(200);
    assert.equal(window.length, 104);
    const truth = bills.filter((r: any) => r.congress === 119 && r.progressStage === 100).length;
    assert.equal(truth, 104);
  });

  await it("reproduces production: the sponsors top-300 cut hides most of California", async () => {
    const top300 = await ctx.db
      .query("congressSponsors")
      .withIndex("by_congress_and_count", (q: any) => q.eq("congress", 119))
      .order("desc")
      .take(300);
    const visibleCa = top300.filter((s: any) => s.sponsorState === "CA").length;
    const realCa = ctx.db
      .rowsOf("congressSponsors")
      .filter((s: any) => s.congress === 119 && s.sponsorState === "CA").length;
    assert.equal(visibleCa, 29, "production shows 29 Californians through this read");
    assert.equal(realCa, 54, "California really has 54 sponsors");
  });

  await it("reproduces production: the most recent law is NOT first in index order", async () => {
    // This is the defect a reader caught: the page is in insertion order, so the
    // model took the max date within an arbitrary 50 and answered S. 1003.
    const page = await ctx.db
      .query("bills")
      .withIndex("by_congress_and_progress_stage", (q: any) =>
        q.eq("congress", 119).eq("progressStage", 100),
      )
      .order("desc")
      .take(50);
    const truthLatest = bills
      .filter((r: any) => r.congress === 119 && r.progressStage === 100)
      .reduce((a: any, b: any) => ((b.latestActionDate ?? "") > (a.latestActionDate ?? "") ? b : a));
    assert.equal(truthLatest.billId, "629s119", "S. 629 is the genuinely most recent law");
    assert.ok(
      !page.some((r: any) => r.billId === "629s119"),
      "S. 629 must be absent from the 50-row page — that absence IS the bug",
    );
  });

  // --- guardrails ----------------------------------------------------------

  await it("refuses an index the schema does not define", () => {
    assert.throws(
      () => ctx.db.query("bills").withIndex("by_nonexistent", (q: any) => q),
      /No index 'by_nonexistent'/,
      "silently returning everything would make a green test meaningless",
    );
  });

  await it("refuses index constraints given out of order", () => {
    assert.throws(
      () =>
        ctx.db
          .query("bills")
          .withIndex("by_congress_and_progress_stage", (q: any) => q.eq("progressStage", 100)),
      /position 0 must constrain 'congress'/,
    );
  });

  await it("supports range reads, which the date filters will need", async () => {
    const rows = await ctx.db
      .query("bills")
      .withIndex("by_congress_and_progress_stage", (q: any) =>
        q.eq("congress", 119).gte("progressStage", 60),
      )
      .collect();
    assert.ok(rows.length > 0);
    assert.ok(
      rows.every((r: any) => (r.progressStage ?? 0) >= 60),
      "a gte range must not leak rows below the bound",
    );
  });
}

main().then(() => {
  if (failures.length > 0) {
    console.error(`fakedb.test.ts — ${passed} passed, ${failures.length} failed`);
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`fakedb.test.ts — ${passed} passed`);
});
export {};
