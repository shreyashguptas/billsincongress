/**
 * The Sort menu on /bills, run through the real `bills.list` handler against a
 * copy of production.
 *
 * The wrong answer a reader got: /bills?status=100 ("Outcome: Became law")
 * listed the 119th Congress's laws in the order our database stored them, with
 * no way to see the newest laws first. Every case here compares a sorted page
 * with a full sort of the whole set it came from, so an order that only looks
 * right on the rows a capped scan happened to read fails.
 *
 * Skips cleanly (exit 3) when .truth-cache/ is absent.
 */
import assert from "node:assert/strict";
import {
  cacheAvailable,
  loadFakeCtx,
  truthCacheRequired,
  CACHE_MISSING_MESSAGE,
  TRUTH_CACHE_SKIP_EXIT,
  type Row,
} from "./fakedb";
import { chamberOf } from "../../convex/chamber";

let passed = 0;
const failures: string[] = [];

async function it(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`,
    );
  }
}

type Sort = "stage" | "latestAction" | "introduced";
const FIELD: Record<Sort, string> = {
  stage: "stageDate",
  latestAction: "latestActionDate",
  introduced: "introducedDate",
};

/** The dates of `set`'s newest `n` bills by `sort`, undated last. */
function newestDates(set: Row[], sort: Sort, n: number): string[] {
  return set
    .map((b) => (b[FIELD[sort]] as string | undefined) ?? "")
    .sort()
    .reverse()
    .slice(0, n);
}

async function main() {
  if (!cacheAvailable()) {
    if (truthCacheRequired()) {
      console.error("REQUIRE_TRUTH_CACHE=1 but no .truth-cache/ — refusing to pass without running.");
      process.exit(1);
    }
    console.log("list-sort.test.ts — skipped");
    console.log(CACHE_MISSING_MESSAGE);
    process.exit(TRUTH_CACHE_SKIP_EXIT);
  }

  const ctx = loadFakeCtx();
  const bills = ctx.db.rowsOf("bills").filter((b) => b.congress === 119);
  const { list } = await import("../../convex/bills");
  const run = (args: Record<string, unknown>) => (list as any)._handler(ctx, args);

  /** Every page of a sorted list, until it says there are no more. */
  async function allPages(args: Record<string, unknown>): Promise<Row[]> {
    const rows: Row[] = [];
    for (let offset = 0; offset <= 500; offset += 50) {
      const page = await run({ ...args, offset, limit: 50 });
      assert.equal(page.truncated, false, `offset ${offset} reported a partial list`);
      rows.push(...page.data);
      if (!page.hasMore) return rows;
    }
    return rows;
  }

  await it("Outcome: Became law, newest laws first — every law, in signing order", async () => {
    const laws = bills.filter((b) => b.progressStage === 100);
    assert.ok(laws.length > 50 && laws.length < 550, `${laws.length} laws fit the offset cap`);
    const rows = await allPages({ congress: 119, progressStage: 100, sort: "stage" });
    assert.equal(rows.length, laws.length, "every law, none twice");
    assert.equal(new Set(rows.map((r) => r.billId)).size, laws.length);
    assert.deepEqual(
      rows.map((r) => r.stageDate ?? ""),
      newestDates(laws, "stage", laws.length),
    );
  });

  await it("Outcome: Became law, by latest action", async () => {
    const laws = bills.filter((b) => b.progressStage === 100);
    const page = await run({ congress: 119, progressStage: 100, sort: "latestAction", limit: 50 });
    assert.deepEqual(
      page.data.map((r: Row) => r.latestActionDate ?? ""),
      newestDates(laws, "latestAction", 50),
    );
  });

  await it("Outcome: Became law, by date introduced — the law set read whole", async () => {
    const laws = bills.filter((b) => b.progressStage === 100);
    const page = await run({ congress: 119, progressStage: 100, sort: "introduced", limit: 50 });
    assert.equal(page.truncated, false);
    assert.deepEqual(
      page.data.map((r: Row) => r.introducedDate),
      newestDates(laws, "introduced", 50),
    );
  });

  await it("every bill, by latest action: page 1 is the Congress's newest activity", async () => {
    const page = await run({ congress: 119, sort: "latestAction", limit: 50 });
    assert.deepEqual(
      page.data.map((r: Row) => r.latestActionDate ?? ""),
      newestDates(bills, "latestAction", 50),
    );
  });

  await it("a sponsor's state, by latest action: the whole state, not the newest-stored 1,200", async () => {
    const wyoming = bills.filter((b) => b.sponsorState === "WY");
    const page = await run({ congress: 119, sponsorState: "WY", sort: "latestAction", limit: 50 });
    assert.equal(page.truncated, false);
    assert.deepEqual(
      page.data.map((r: Row) => r.latestActionDate ?? ""),
      newestDates(wyoming, "latestAction", 50),
    );
  });

  await it("Senate bills, by latest action: four bill types merged in order", async () => {
    const senate = bills.filter((b) => chamberOf(b.billType) === "senate");
    const page = await run({ congress: 119, chamber: "senate", sort: "latestAction", limit: 50 });
    assert.ok(page.data.every((r: Row) => chamberOf(r.billType) === "senate"));
    assert.deepEqual(
      page.data.map((r: Row) => r.latestActionDate ?? ""),
      newestDates(senate, "latestAction", 50),
    );
  });

  await it("a topic, by latest action", async () => {
    const health = bills.filter((b) => b.policyAreaName === "Health");
    const page = await run({ congress: 119, policyArea: "Health", sort: "latestAction", limit: 50 });
    assert.deepEqual(
      page.data.map((r: Row) => r.latestActionDate ?? ""),
      newestDates(health, "latestAction", 50),
    );
  });

  await it("by date introduced, in the last month: the window only, newest first", async () => {
    const page = await run({
      congress: 119,
      introducedDateFilter: "month",
      sort: "introduced",
      limit: 50,
    });
    assert.equal(page.truncated, false);
    for (let i = 1; i < page.data.length; i++) {
      assert.ok(page.data[i - 1].introducedDate >= page.data[i].introducedDate, `row ${i}`);
    }
  });

  await it("no sort leaves the stored order, as before", async () => {
    const page = await run({ congress: 119, progressStage: 100, limit: 10 });
    const stored = bills
      .filter((b) => b.progressStage === 100)
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 10)
      .map((b) => b.billId);
    assert.deepEqual(page.data.map((r: Row) => r.billId), stored);
  });

  if (failures.length > 0) {
    console.error(`list-sort: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log(`list-sort: ${passed} passed`);
}

void main();
