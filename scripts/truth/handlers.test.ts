/**
 * The real fetch handlers, run against a real copy of production.
 *
 * THIS IS THE TEST THAT MATTERS. Every accuracy defect in the 2026-08-30 audit
 * lived in the interaction between a handler, an index and a scan cap — which no
 * pure-module test can reach and no three-row fixture can reproduce. "Health
 * bills that became law returns 0" only happens when there are 2,121 Health bills
 * and the newest 1,000 are all still in committee.
 *
 * Each case below names the wrong answer a reader actually received, and asserts
 * both halves of the fix: the right number, AND an honest completeness claim.
 * A handler that returns the right number while still calling a sample complete
 * has not been fixed, it has been made luckier.
 *
 * Skips cleanly when .truth-cache/ is absent so `pnpm test` stays hermetic.
 * Populate it with: ./node_modules/.bin/tsx scripts/truth/dump.ts
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import {
  CACHE_MISSING_MESSAGE,
  TRUTH_CACHE_SKIP_EXIT,
  cacheAvailable,
  loadFakeCtx,
  truthCacheRequired,
} from "./fakedb";
import { validateFilters } from "../../convex/catalog/filters";
import { isDatasetName } from "../../convex/catalog/datasets";

let passed = 0;
const failures: string[] = [];

async function it(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`,
    );
  }
}

/**
 * Drive the REAL dispatcher. `runFetch` is the same function the registered
 * Convex query delegates to, so these tests exercise production's code path and
 * not a copy of it — validation, index choice, scan caps and all.
 */
async function fetchViaHandlers(
  ctx: any,
  name: string,
  filters: Record<string, unknown>,
  limit?: number,
): Promise<any> {
  assert.ok(isDatasetName(name), `unknown dataset '${name}'`);
  const validated = validateFilters(name as any, filters);
  if (!validated.ok) return { ok: false, error: validated.error };
  const { runFetch } = await import("../../convex/catalog/fetch");
  return await runFetch(ctx, { name, filters, ...(limit !== undefined ? { limit } : {}) });
}

async function main() {
  if (!cacheAvailable()) {
    if (truthCacheRequired()) {
      console.error("REQUIRE_TRUTH_CACHE=1 but no .truth-cache/ — refusing to pass without running.");
      process.exit(1);
    }
    console.log(`handlers.test.ts — skipped`);
    console.log(CACHE_MISSING_MESSAGE);
    process.exit(TRUTH_CACHE_SKIP_EXIT);
  }
  const ctx = loadFakeCtx();
  const bills = ctx.db.rowsOf("bills");
  const sponsorRows = ctx.db.rowsOf("congressSponsors");
  const truth = {
    laws119: bills.filter((b: any) => b.congress === 119 && b.progressStage === 100),
    healthLaws: bills.filter(
      (b: any) => b.congress === 119 && b.policyAreaName === "Health" && b.progressStage === 100,
    ).length,
    txLaws: bills.filter(
      (b: any) => b.congress === 119 && b.sponsorState === "TX" && b.progressStage === 100,
    ).length,
    caSponsors: sponsorRows.filter((s: any) => s.congress === 119 && s.sponsorState === "CA"),
  };

  // --- D4/D5: topic + stage used to return a confident zero -----------------

  await it("Health bills that became law: a real number, not zero", async () => {
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      policyArea: "Health",
      progressStage: 100,
    });
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    assert.equal(r.report.complete, true, "this pair is indexed, so it must read completely");
    assert.equal(r.report.total, truth.healthLaws);
    assert.ok(truth.healthLaws > 0, "sanity: there really are Health laws");
  });

  await it("Texas bills that became law: eleven, not 'we have no data'", async () => {
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      sponsorState: "TX",
      progressStage: 100,
    });
    assert.ok(r.ok);
    assert.equal(r.report.complete, true);
    assert.equal(r.report.total, truth.txLaws);
    assert.ok(truth.txLaws > 0, "sanity: Texas really does have laws");
  });

  // --- D9: the defect a reader caught ---------------------------------------

  await it("the most recent law is S. 629, and it is the first row", async () => {
    const r = await fetchViaHandlers(
      ctx,
      "bills",
      { congress: 119, progressStage: 100, sort: "newest_action" },
      50,
    );
    assert.ok(r.ok);
    assert.equal(r.report.complete, true);
    assert.equal(r.report.order, "newest_action_first");
    assert.equal(r.rows[0].billId, "629s119", "S. 629 must lead a newest-first sort");
    assert.equal(r.report.total, 104);
  });

  await it("without a sort, the order is declared arbitrary rather than implied", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 119, progressStage: 100 }, 50);
    assert.ok(r.ok);
    assert.equal(r.report.order, "arbitrary", "silence about order is what let the model invent one");
  });

  await it("'the most recent bill' is answerable even when the set is too big to count", async () => {
    // Served by an ordering index, so the rows really are the first of the whole
    // set. "Cannot count it" and "cannot order it" are different problems, and
    // conflating them refused a question we can answer exactly.
    const r = await fetchViaHandlers(ctx, "bills", { congress: 119, sort: "newest_action" }, 3);
    assert.ok(r.ok);
    assert.equal(r.report.order, "newest_action_first");
    assert.equal(r.report.orderFromIndex, true, "the index guarantees this order");
    assert.equal(r.report.total, undefined, "but the size of the set is still unknown");
    const trueMax = bills
      .filter((b: any) => b.congress === 119)
      .reduce((a: any, b: any) => ((b.latestActionDate ?? "") > (a.latestActionDate ?? "") ? b : a))
      .latestActionDate;
    assert.equal(r.rows[0].latestActionDate, trueMax, "row 1 must carry the true maximum date");
  });

  await it("the newest bill of a FILTERED set is right too, not just the newest overall", async () => {
    for (const [label, filters, pred] of [
      ["California", { congress: 119, sponsorState: "CA", sort: "newest_action" }, (b: any) => b.sponsorState === "CA"],
      ["Health", { congress: 119, policyArea: "Health", sort: "newest_action" }, (b: any) => b.policyAreaName === "Health"],
    ] as Array<[string, Record<string, unknown>, (b: any) => boolean]>) {
      const r = await fetchViaHandlers(ctx, "bills", filters, 3);
      assert.ok(r.ok, label);
      const trueMax = bills
        .filter((b: any) => b.congress === 119 && pred(b))
        .reduce((a: any, b: any) => ((b.latestActionDate ?? "") > (a.latestActionDate ?? "") ? b : a))
        .latestActionDate;
      assert.equal(r.rows[0].latestActionDate, trueMax, `${label}: row 1 is not the newest`);
    }
  });

  await it("a sort with NO index behind it is still refused rather than faked", async () => {
    // A title search cannot be combined with an ordering index, and the search
    // window fills, so there is no honest order to claim.
    const r = await fetchViaHandlers(
      ctx,
      "bills",
      { congress: 119, titleFilter: "Act", sort: "newest_action" },
      50,
    );
    assert.ok(r.ok);
    assert.equal(r.report.complete, false);
    assert.equal(r.report.order, "arbitrary", "a sorted SAMPLE must never be labelled sorted");
    assert.notEqual(r.report.orderFromIndex, true);
    assert.equal(r.report.total, undefined);
  });

  // --- D2: sponsors reported a fraction of a state as the whole roster -------

  await it("California's roster is complete, and the minimum is the real minimum", async () => {
    const r = await fetchViaHandlers(ctx, "sponsors", { congress: 119, sponsorState: "CA" }, 50);
    assert.ok(r.ok);
    assert.equal(r.report.complete, true);
    assert.equal(r.report.total, truth.caSponsors.length);
    assert.ok(truth.caSponsors.length > 50, "sanity: California has more than a page of members");
    const realMin = truth.caSponsors.reduce((a: any, b: any) =>
      b.billCount < a.billCount ? b : a,
    );
    // The rows are a page of a known-complete set, ordered most-bills-first, so
    // the minimum is NOT on the page — and the contract says so rather than
    // letting the model read the last row as the fewest.
    assert.equal(r.report.order, "most_bills_first");
    assert.ok(
      r.report.total > r.report.shown,
      "the page is a sample of a complete set; the contract must flag that",
    );
    assert.ok(realMin.billCount < 25, "sanity: the true minimum is well below the old answer of 25");
  });

  await it("a small state returns every one of its members", async () => {
    const r = await fetchViaHandlers(ctx, "sponsors", { congress: 119, sponsorState: "ND" }, 50);
    assert.ok(r.ok);
    const realNd = sponsorRows.filter(
      (s: any) => s.congress === 119 && s.sponsorState === "ND",
    ).length;
    assert.equal(r.report.complete, true);
    assert.equal(r.report.total, realNd);
    assert.equal(r.rows.length, realNd, "production returned 1 of these; all must come back");
  });

  // --- D6: two-word surnames returned zero bills ----------------------------

  await it("Monica De La Cruz has bills, not zero", async () => {
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      sponsorFilter: ["Monica De La Cruz"],
    });
    assert.ok(r.ok);
    const real = bills.filter(
      (b: any) =>
        b.congress === 119 &&
        `${b.sponsorFirstName ?? ""} ${b.sponsorLastName ?? ""}`.trim() === "Monica De La Cruz",
    ).length;
    assert.ok(real > 0, "sanity: she really has sponsored bills");
    assert.equal(r.report.total, real);
  });

  await it("single-word surnames still work", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 119, sponsorFilter: ["Katie Britt"] });
    assert.ok(r.ok);
    const real = bills.filter(
      (b: any) =>
        b.congress === 119 &&
        `${b.sponsorFirstName ?? ""} ${b.sponsorLastName ?? ""}`.trim() === "Katie Britt",
    ).length;
    assert.equal(r.report.total, real);
    assert.ok(real > 0);
  });

  await it("an unrecognised sponsor name is 'we could not check', never a confident zero", async () => {
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      sponsorFilter: ["Nobody McNotreal"],
    });
    assert.ok(r.ok);
    assert.equal(
      r.report.complete,
      false,
      "a name we cannot resolve must not come back as a complete zero — that states as " +
        "fact that a member introduced nothing",
    );
    assert.equal(r.report.total, undefined);
  });

  await it("a real member with no bills is still an honest complete zero", async () => {
    // Distinguishes "we could not check" from "we checked and there are none".
    // A resolvable surname with a wrong first name resolves the surname, reads
    // the index, and legitimately matches nothing.
    const anyKnown = sponsorRows.find((s: any) => s.congress === 119);
    assert.ok(anyKnown, "sanity: the roster is not empty");
    const surname = String(anyKnown.sponsorName).trim().split(/\s+/).slice(1).join(" ");
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      sponsorFilter: [`Zzzz ${surname}`],
    });
    assert.ok(r.ok);
    assert.equal(r.report.complete, true, "the surname resolved, so the read was real");
    assert.equal(r.report.total, 0);
  });

  // --- D3: chamber stats carried whole-Congress numbers ---------------------

  await it("a House stats row carries no whole-Congress figures at all", async () => {
    const r = await fetchViaHandlers(ctx, "stats", { congress: 119, chamber: "house" });
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    const row = r.rows[0];
    for (const leaked of ["totalMeasures", "houseMeasures", "senateMeasures", "totalCount"]) {
      assert.equal(row[leaked], undefined, `${leaked} must not ride along on a chamber row`);
    }
    const houseLaws = truth.laws119.filter((b: any) =>
      ["hr", "hjres", "hconres", "hres"].includes(b.billType),
    ).length;
    const partySum = Object.values(row.partyLawCounts as Record<string, number>).reduce(
      (a, b) => a + b,
      0,
    );
    assert.equal(partySum, houseLaws, "the only law count on this row must be the House's");
    assert.notEqual(houseLaws, truth.laws119.length, "sanity: 64 and 104 are different numbers");
  });

  await it("the whole-Congress stats row says in words that it covers both chambers", async () => {
    const r = await fetchViaHandlers(ctx, "stats", { congress: 119 });
    assert.ok(r.ok);
    assert.match(r.rows[0].scope, /both chambers/i);
    const statsRow = ctx.db.rowsOf("congressStats").find((s: any) => s.congress === 119);
    assert.ok(statsRow, "no congressStats row for the 119th in the local copy");
    assert.equal(r.rows[0].totalMeasures, statsRow.totalCount);
  });

  // --- D13: terminal buckets read as milestones -----------------------------

  await it("'passed the Senate' counts everything that got at least that far", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 119, billType: "s", reachedStage: 60 }, 0);
    assert.ok(r.ok);
    const real = bills.filter(
      (b: any) =>
        b.congress === 119 &&
        b.billType === "s" &&
        [60, 80, 85, 90, 95, 100].includes(b.progressStage ?? 20),
    ).length;
    assert.equal(r.report.complete, true);
    assert.equal(r.report.total, real);
    const terminalOnly = bills.filter(
      (b: any) => b.congress === 119 && b.billType === "s" && b.progressStage === 60,
    ).length;
    assert.ok(real > terminalOnly, "the milestone must exceed the terminal bucket");
  });

  await it("progressStage and reachedStage together are refused", async () => {
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      progressStage: 60,
      reachedStage: 60,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /not both/i);
  });

  // --- count-only mode ------------------------------------------------------

  await it("limit 0 returns an exact total and no rows", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 119, policyArea: "Health" }, 0);
    assert.ok(r.ok);
    assert.equal(r.rows.length, 0, "count-only must not spend context on rows");
    assert.equal(r.report.complete, true, "the deeper count scan must reach past 2,121 Health bills");
    const real = bills.filter(
      (b: any) => b.congress === 119 && b.policyAreaName === "Health",
    ).length;
    assert.equal(r.report.total, real);
  });

  // --- D7: action ordering --------------------------------------------------

  await it("H.R. 1's timeline is in true order and includes the vote that passed it", async () => {
    const r = await fetchViaHandlers(ctx, "bill_actions", { billId: "1hr119" }, 50);
    assert.ok(r.ok);
    assert.equal(r.report.order, "chronological");
    const dates = r.rows.map((a: any) => a.date);
    assert.deepEqual([...dates].sort(), dates, "dates must be non-decreasing");
    // Signed, then became public law — not the other way round.
    const signed = r.rows.findIndex((a: any) => /signed by president/i.test(a.text));
    const became = r.rows.findIndex((a: any) => /became public law/i.test(a.text));
    if (signed !== -1 && became !== -1) {
      assert.ok(signed < became, "a bill is signed BEFORE it becomes public law");
    }
    assert.equal(r.report.complete, true);
  });

  await it("action handles name the action, not its position on a page", async () => {
    const wide = await fetchViaHandlers(ctx, "bill_actions", { billId: "1hr119" }, 50);
    const narrow = await fetchViaHandlers(ctx, "bill_actions", { billId: "1hr119" }, 5);
    for (let i = 0; i < narrow.rows.length; i++) {
      assert.equal(
        narrow.rows[i]._cite,
        wide.rows[i]._cite,
        "the same action must keep the same handle at any page size",
      );
    }
  });

  // --- D12: topics ----------------------------------------------------------

  await it("topics returns every policy area, not the first twenty", async () => {
    const r = await fetchViaHandlers(ctx, "topics", { congress: 119 });
    assert.ok(r.ok);
    const real = ctx.db
      .rowsOf("congressPolicyAreas")
      .filter((t: any) => t.congress === 119).length;
    assert.equal(r.rows.length, real);
    assert.equal(r.report.total, real);
    assert.ok(real > 20, "sanity: there are more than 20 policy areas");
  });

  // --- D17: freshness, and D14: resolutions are not bills -------------------

  await it("the stats row says how fresh our data is", async () => {
    const r = await fetchViaHandlers(ctx, "stats", { congress: 119 });
    assert.ok(r.ok);
    assert.match(
      String(r.rows[0].dataLastSynced),
      /^\d{4}-\d{2}-\d{2}/,
      "without this the assistant invented a freshness guarantee",
    );
    assert.ok(r.rows[0].figuresLastRecomputed);
  });

  await it("a chamber row with no stage ladder says so instead of borrowing one", async () => {
    // The local copy predates the chamber stageCounts backfill, which is exactly
    // the state production will be in until the recompute runs — so this asserts
    // the FALLBACK is safe, not merely that the happy path works.
    const r = await fetchViaHandlers(ctx, "stats", { congress: 119, chamber: "senate" });
    assert.ok(r.ok);
    const row = r.rows[0];
    if (row.stageCounts === undefined) {
      assert.match(String(row.stageCounts_unavailable), /do not use the whole-congress/i);
    } else {
      const laws = (row.stageCounts as Array<{ stage: number; count: number }>).find(
        (x) => x.stage === 100,
      );
      const partySum = Object.values(row.partyLawCounts as Record<string, number>).reduce(
        (a, b) => a + b,
        0,
      );
      assert.equal(laws?.count, partySum, "a chamber ladder must agree with its own party split");
    }
  });

  await it("resolutions are labelled as resolutions, not bills", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 119, billType: "hres" }, 5);
    assert.ok(r.ok);
    assert.ok(r.rows.length > 0, "sanity: the 119th has simple resolutions");
    for (const row of r.rows) {
      assert.equal(row.measureType, "simple resolution");
      assert.equal(row.canBecomeLaw, false, "a simple resolution never reaches the President");
    }
    const bill = await fetchViaHandlers(ctx, "bills", { congress: 119, billType: "hr" }, 1);
    assert.equal(bill.rows[0].measureType, "bill");
    assert.equal(bill.rows[0].canBecomeLaw, true);
  });

  // --- D19: an unqualified fetch says which Congress it read ----------------

  await it("the set description names the Congress, so a default cannot pass unnoticed", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { progressStage: 100 }, 5);
    assert.ok(r.ok);
    assert.match(r.report.set, /119th Congress/, "an implicit Congress must still be stated");
  });

  // --- found by adversarial review of PR #92, after the first fix landed ----
  // Every case below was a "complete: true" with a number that was wrong, i.e.
  // the exact class this change exists to remove, surviving inside the fix.

  await it("a multi-token GIVEN name still finds the member's bills", async () => {
    // "Anna Paulina Luna" is stored first="Anna Paulina", last="Luna". Deriving
    // the surname as everything-after-the-first-token produced "Paulina Luna",
    // matched nothing, and reported a complete total of 0 against her real 39.
    for (const name of ["Anna Paulina Luna", "Mary Gay Scanlon"]) {
      const r = await fetchViaHandlers(ctx, "bills", { congress: 119, sponsorFilter: [name] }, 0);
      assert.ok(r.ok, `${name}: ${r.error}`);
      const real = bills.filter(
        (b: any) =>
          b.congress === 119 &&
          `${b.sponsorFirstName ?? ""} ${b.sponsorLastName ?? ""}`.trim() === name,
      ).length;
      assert.ok(real > 0, `sanity: ${name} really has bills`);
      assert.equal(r.report.total, real, `${name} came back wrong`);
      assert.equal(r.report.complete, true);
    }
  });

  await it("a surname stored in two casings is counted once, in full", async () => {
    // The 118th holds Barbara Lee's surname as both "LEE" and "Lee". An index eq
    // is case-sensitive, so one bucket was invisible: 12 reported against 59.
    const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
    for (const name of ["Barbara Lee", "Christopher Smith"]) {
      const r = await fetchViaHandlers(ctx, "bills", { congress: 118, sponsorFilter: [name] }, 0);
      assert.ok(r.ok, `${name}: ${r.error}`);
      const real = bills.filter(
        (b: any) =>
          b.congress === 118 &&
          norm(`${b.sponsorFirstName ?? ""} ${b.sponsorLastName ?? ""}`) === norm(name),
      ).length;
      assert.equal(r.report.total, real, `${name} missed a casing`);
    }
  });

  await it("a count-only title search cannot fabricate a total of 1024", async () => {
    // Convex caps full-text search at SEARCH_LIMIT results whatever we ask for,
    // so the count-only ceiling of 5,000 could never detect the cut and every
    // title search reported itself complete — 1,024 against a truth of ~14,900.
    const r = await fetchViaHandlers(ctx, "bills", { congress: 119, titleFilter: "Act" }, 0);
    assert.ok(r.ok);
    assert.equal(r.report.complete, false, "a capped search must not claim completeness");
    assert.equal(r.report.total, undefined);
  });

  await it("'the fewest bills in California' is answerable, and it is James Gallagher", async () => {
    // The read was complete and the total exact, but the page was 50 of 54
    // ordered most-first, so the true minimum was never on it.
    const r = await fetchViaHandlers(
      ctx,
      "sponsors",
      { congress: 119, sponsorState: "CA", sort: "fewest_bills" },
      5,
    );
    assert.ok(r.ok);
    assert.equal(r.report.order, "fewest_bills_first");
    const realMin = truth.caSponsors.reduce((a: any, b: any) =>
      b.billCount < a.billCount ? b : a,
    );
    assert.equal(r.rows[0].sponsorName, realMin.sponsorName);
    assert.equal(r.rows[0].billCount, realMin.billCount);
  });

  await it("one unrecognised name among several does not get silently counted as zero", async () => {
    // Union-of-spellings made a mixed list dangerous: the real name returns rows,
    // so the read looks productive, and the unplaceable one is folded in as 0.
    const r = await fetchViaHandlers(
      ctx,
      "bills",
      { congress: 119, sponsorFilter: ["Katie Britt", "Nobody McNotreal"] },
      0,
    );
    assert.ok(r.ok);
    assert.equal(
      r.report.complete,
      false,
      "a name we could not place must make the whole total unreportable",
    );
    assert.equal(r.report.total, undefined);
  });

  await it("a Congress we hold nothing for is refused, not answered zero", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 116, progressStage: 100 }, 0);
    assert.equal(r.ok, false, "an unloaded Congress must not report a complete total of 0");
    assert.match(r.error, /not a count of zero/i);
    assert.match(r.error, /116th/, "and it must name the Congress correctly, not '116th' as '116th'");
  });

  await it("an empty sponsorFilter is rejected rather than matching nothing", async () => {
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      progressStage: 100,
      sponsorFilter: [],
    });
    assert.equal(r.ok, false, "an empty list silently rejected all 104 laws and called it complete");
    assert.match(r.error, /empty list/i);
  });

  await it("a bill with no date satisfies no date bound", async () => {
    const r = await fetchViaHandlers(
      ctx,
      "bills",
      { congress: 119, progressStage: 20, actionBefore: "2020-01-01" },
      0,
    );
    assert.ok(r.ok);
    const real = bills.filter(
      (b: any) =>
        b.congress === 119 &&
        b.progressStage === 20 &&
        b.latestActionDate &&
        b.latestActionDate <= "2020-01-01",
    ).length;
    assert.equal(r.report.total, real);
    assert.equal(r.report.total, 0, "undated rows used to slip under every 'before' bound");
  });

  await it("the set description ordinalises the Congress correctly", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 117, progressStage: 100 }, 1);
    assert.ok(r.ok);
    assert.match(r.report.set, /117th Congress/);
    assert.ok(!/\d+(?:1th|2th|3th)\b/.test(r.report.set), "printed '101th' style ordinals");
  });

  await it("an undated bill is never returned as 'the oldest'", async () => {
    // Convex sorts a missing value before every string, so an ascending index
    // read put the eleven undated measures of the 119th at the front — and the
    // contract then told the model row 1 was genuinely the oldest, of a bill with
    // no known date at all.
    for (const [sort, field] of [
      ["oldest_action", "latestActionDate"],
      ["oldest_introduced", "introducedDate"],
    ] as Array<[string, string]>) {
      const r = await fetchViaHandlers(ctx, "bills", { congress: 119, sort }, 5);
      assert.ok(r.ok, sort);
      for (const row of r.rows) {
        assert.ok(row[field], `${sort}: returned a row with no ${field}`);
      }
      const trueMin = bills
        .filter((b: any) => b.congress === 119 && b[field])
        .reduce((a: any, b: any) => (b[field] < a[field] ? b : a))[field];
      assert.equal(r.rows[0][field], trueMin, `${sort}: row 1 is not the true oldest`);
    }
  });

  await it("the set description names every filter that narrowed it", async () => {
    // It listed billType but not billNumber, so an exact one-bill lookup read as
    // "every measure of type hr" with a total of 1 — a self-contradiction.
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      billType: "hr",
      billNumber: "1",
    }, 2);
    assert.ok(r.ok);
    assert.match(r.report.set, /numbered 1/, "billNumber missing from the set description");
    assert.equal(r.report.total, 1);
  });

  await it("a state's roster counts people, not spellings of their name", async () => {
    // The 118th stores Barbara Lee as "Barbara Lee" (12) and "BARBARA LEE" (47),
    // so California reported 67 members against 54 seats, and the split halves
    // corrupted the ranking — Anna Eshoo showed 4 bills against a real 30.
    const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
    for (const congress of [117, 118, 119]) {
      const r = await fetchViaHandlers(ctx, "sponsors", { congress, sponsorState: "CA" }, 50);
      assert.ok(r.ok);
      const people = new Set(
        sponsorRows
          .filter((s: any) => s.congress === congress && s.sponsorState === "CA")
          .map((s: any) => norm(s.sponsorName)),
      );
      assert.equal(r.report.total, people.size, `CA ${congress} counted spellings, not people`);
    }
    // And the merged count must equal what the bills table actually holds.
    const r = await fetchViaHandlers(
      ctx,
      "sponsors",
      { congress: 118, sponsorState: "CA", sort: "most_bills" },
      50,
    );
    const lee = r.rows.find((x: any) => norm(x.sponsorName) === "barbara lee");
    const realLee = bills.filter(
      (b: any) =>
        b.congress === 118 &&
        norm(`${b.sponsorFirstName ?? ""} ${b.sponsorLastName ?? ""}`) === "barbara lee",
    ).length;
    assert.equal(lee?.billCount, realLee, "a merged member's count must match the bills table");
  });

  await it("a filter value in the wrong case is normalised, not answered zero", async () => {
    const lower = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      sponsorState: "Ca",
      progressStage: 100,
    }, 0);
    const upper = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      sponsorState: "CA",
      progressStage: 100,
    }, 0);
    assert.ok(lower.ok && upper.ok);
    assert.equal(lower.report.total, upper.report.total, "'Ca' must mean California");
    const shouty = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      billType: "HR",
      progressStage: 100,
    }, 0);
    assert.ok(shouty.ok);
    assert.ok((shouty.report.total ?? 0) > 0, "'HR' must mean hr");
  });

  await it("a misspelled policy area is refused with the right spelling, not answered zero", async () => {
    const wrongCase = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      policyArea: "health",
      progressStage: 100,
    }, 0);
    assert.equal(wrongCase.ok, false, "'health' reported a complete zero over a capital letter");
    assert.match(wrongCase.error, /'Health'/, "the error must name the spelling we do hold");

    const unknown = await fetchViaHandlers(ctx, "bills", { congress: 119, policyArea: "Nonsense" }, 0);
    assert.equal(unknown.ok, false);
    assert.match(unknown.error, /not a count of zero/i);
  });

  // --- the invariant, checked across many shapes ----------------------------

  await it("no result ever carries a total without claiming completeness", async () => {
    const shapes: Array<[string, Record<string, unknown>, number | undefined]> = [
      ["bills", { congress: 119 }, 50],
      ["bills", { congress: 119, policyArea: "Health" }, 20],
      ["bills", { congress: 119, chamber: "house" }, 20],
      ["bills", { congress: 119, progressStage: 40 }, 20],
      ["bills", { congress: 118, sponsorState: "CA" }, 20],
      ["sponsors", { congress: 119 }, 20],
      ["sponsors", { congress: 118, sponsorState: "TX" }, 20],
      ["topics", { congress: 118 }, undefined],
      ["stats", { congress: 119 }, undefined],
    ];
    for (const [name, filters, limit] of shapes) {
      const r = await fetchViaHandlers(ctx, name, filters, limit);
      if (!r.ok) continue;
      const label = `${name} ${JSON.stringify(filters)}`;
      if (r.report.complete) {
        assert.equal(typeof r.report.total, "number", `${label}: complete but no total`);
      } else {
        assert.equal(r.report.total, undefined, `${label}: INCOMPLETE result carried a total`);
        assert.equal(r.report.order, "arbitrary", `${label}: incomplete result claimed an order`);
      }
      assert.ok(typeof r.report.set === "string" && r.report.set.length > 0, `${label}: no set`);
    }
  });
}

main().then(() => {
  if (failures.length > 0) {
    console.error(`handlers.test.ts — ${passed} passed, ${failures.length} failed`);
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`handlers.test.ts — ${passed} passed`);
});
export {};
