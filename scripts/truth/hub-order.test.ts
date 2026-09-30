/**
 * The hub pages' "Newest first" / "Oldest first", run against a real copy of
 * production.
 *
 * The wrong answer a reader got: /bills/enacted listed the 119th Congress's laws
 * in the order our database happened to store them — Senate bills, then House
 * bills — with each row's introduction date making it look sorted. The five
 * laws signed on 25 Sep 2026, the newest there are, sat at rows 13, 64, 68, 98
 * and 107, four of them on pages 2 and 3.
 *
 * `stageDate` does not exist in the snapshot yet (it arrives with this change's
 * backfill), so it is derived here exactly as the backfill derives it:
 * `calculateBillStage` over the bill's stored actions, then `stageDateFor`.
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
import { calculateBillStage, stageDateFor } from "../../convex/billStage";
import { chamberOf } from "../../convex/chamber";
import { takeFirst, type HubOrder } from "../../convex/hubOrder";

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

const label = (b: Row) => `${b.billTypeLabel}${b.billNumber}`;

/** Asserts `rows` is in `order` by `field`, with undated rows only at the end. */
function assertOrdered(rows: Row[], field: string, order: HubOrder) {
  let seenUndated = false;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1][field];
    const next = rows[i][field];
    if (!prev) seenUndated = true;
    if (seenUndated) {
      assert.ok(!next, `a dated row (${label(rows[i])}, ${next}) follows an undated one at ${i}`);
      continue;
    }
    if (!next) continue;
    assert.ok(
      order === "newest" ? prev >= next : prev <= next,
      `${order}: row ${i - 1} ${label(rows[i - 1])} (${prev}) before row ${i} ${label(rows[i])} (${next})`,
    );
  }
}

async function main() {
  if (!cacheAvailable()) {
    if (truthCacheRequired()) {
      console.error("REQUIRE_TRUTH_CACHE=1 but no .truth-cache/ — refusing to pass without running.");
      process.exit(1);
    }
    console.log("hub-order.test.ts — skipped");
    console.log(CACHE_MISSING_MESSAGE);
    process.exit(TRUTH_CACHE_SKIP_EXIT);
  }

  const ctx = loadFakeCtx();
  const bills = ctx.db.rowsOf("bills");

  // The backfill, applied to the snapshot: stageDate from the stored actions.
  const actionsByBill = new Map<string, Row[]>();
  for (const a of ctx.db.rowsOf("billActions")) {
    const list = actionsByBill.get(a.billId);
    if (list) list.push(a);
    else actionsByBill.set(a.billId, [a]);
  }
  for (const b of bills) {
    const actions = actionsByBill.get(b.billId) ?? [];
    b.stageDate = stageDateFor(
      calculateBillStage(
        actions.map((a) => ({
          text: a.text,
          type: a.type,
          actionCode: a.actionCode,
          actionDate: a.actionDate,
        })),
      ),
      b.introducedDate,
    );
  }

  const { sortedBills } = await import("../../convex/bills");
  const read = (scope: any, order: HubOrder, n = 100_000) =>
    takeFirst(sortedBills(ctx as any, 119, scope, order) as AsyncIterable<Row>, n);

  await it("/bills/enacted, newest first: the laws signed on 25 Sep 2026 open page 1", async () => {
    const rows = await read({ kind: "stage", progressStage: 100 }, "newest");
    const laws = bills.filter((b) => b.congress === 119 && b.progressStage === 100);
    assert.equal(rows.length, laws.length, "every law, none twice");
    assert.equal(new Set(rows.map((r) => r.billId)).size, laws.length);
    assertOrdered(rows, "stageDate", "newest");

    const newest = laws.map((b) => b.stageDate).sort().at(-1);
    const signedThatDay = laws.filter((b) => b.stageDate === newest).length;
    assert.ok(signedThatDay >= 1);
    assert.deepEqual(
      rows.slice(0, signedThatDay).map((r) => r.stageDate),
      Array(signedThatDay).fill(newest),
      "page 1 starts with the newest laws",
    );
  });

  await it("/bills/enacted dates H.R. 1043 by its signing, not the report filed after it", async () => {
    const rows = await read({ kind: "stage", progressStage: 100 }, "newest");
    const hr1043 = rows.find((r) => r.billId === "1043hr119");
    assert.ok(hr1043, "H.R. 1043 is on the page");
    assert.equal(hr1043.stageDate, "2025-12-29");
    assert.notEqual(hr1043.latestActionDate, hr1043.stageDate, "the case still exists in the data");
  });

  await it("/bills/enacted, oldest first: the reverse set, first law of the Congress first", async () => {
    const rows = await read({ kind: "stage", progressStage: 100 }, "oldest");
    const newestFirst = await read({ kind: "stage", progressStage: 100 }, "newest");
    assert.equal(rows.length, newestFirst.length);
    assertOrdered(rows, "stageDate", "oldest");
    assert.ok(rows[0].stageDate < "2025-03-01", `first law ${label(rows[0])} dated ${rows[0].stageDate}`);
  });

  await it("every stage hub's stage date is on or after introduction", async () => {
    for (const stage of [20, 40, 60, 85, 100]) {
      const rows = await read({ kind: "stage", progressStage: stage }, "newest", 600);
      for (const r of rows) {
        if (r.stageDate && r.introducedDate) {
          assert.ok(
            r.stageDate >= r.introducedDate,
            `${label(r)} (stage ${stage}) reached it ${r.stageDate}, before introduction ${r.introducedDate}`,
          );
        }
      }
    }
  });

  await it("/bills/senate reaches page 10 in order — the merge of four bill types", async () => {
    for (const order of ["newest", "oldest"] as const) {
      const rows = await read({ kind: "chamber", chamber: "senate" }, order, 501);
      assert.equal(rows.length, 501);
      assert.ok(rows.every((r) => r.congress === 119 && chamberOf(r.billType) === "senate"));
      assertOrdered(rows, "latestActionDate", order);
      assert.equal(new Set(rows.map((r) => r.billId)).size, 501);
    }
    // All four types appear: the merge is not just reading "s".
    const newest = await read({ kind: "chamber", chamber: "senate" }, "newest", 501);
    assert.ok(new Set(newest.map((r) => r.billType)).size >= 2, "more than one Senate type");
  });

  await it("/bills/house, newest first, matches a full sort of every House bill", async () => {
    const rows = await read({ kind: "chamber", chamber: "house" }, "newest", 500);
    const house = bills
      .filter((b) => b.congress === 119 && chamberOf(b.billType) === "house")
      .map((b) => b.latestActionDate ?? "")
      .sort()
      .reverse()
      .slice(0, 500);
    assert.deepEqual(rows.map((r) => r.latestActionDate ?? ""), house);
  });

  await it("House bills with no action yet come last in both orders, never first", async () => {
    const undated = bills.filter(
      (b) => b.congress === 119 && chamberOf(b.billType) === "house" && !b.latestActionDate,
    ).length;
    for (const order of ["newest", "oldest"] as const) {
      const rows = await read({ kind: "chamber", chamber: "house" }, order);
      assert.ok(rows[0].latestActionDate, `${order} opens with a dated bill`);
      assertOrdered(rows, "latestActionDate", order);
      assert.equal(rows.filter((r) => !r.latestActionDate).length, undated);
    }
  });

  await it("/bills/topic/health is the whole topic, in order", async () => {
    const health = bills.filter((b) => b.congress === 119 && b.policyAreaName === "Health");
    for (const order of ["newest", "oldest"] as const) {
      const rows = await read({ kind: "topic", policyArea: "Health" }, order);
      assert.equal(rows.length, health.length);
      assertOrdered(rows, "latestActionDate", order);
    }
  });

  if (failures.length > 0) {
    console.error(`\nhub-order: ${passed} passed, ${failures.length} FAILED\n`);
    console.error(failures.join("\n\n"));
    process.exit(1);
  }
  console.log(`hub-order: all ${passed} tests passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
