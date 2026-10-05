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
import { readFileSync } from "node:fs";
import {
  CACHE_MISSING_MESSAGE,
  FakeDb,
  TRUTH_CACHE_SKIP_EXIT,
  cacheAvailable,
  loadFakeCtx,
  parseSchema,
  truthCacheRequired,
} from "./fakedb";
import { validateFilters } from "../../convex/catalog/filters";
import { isDatasetName } from "../../convex/catalog/datasets";
import { payloadFor } from "../../convex/catalog/completeness";

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
  today?: string,
): Promise<any> {
  assert.ok(isDatasetName(name), `unknown dataset '${name}'`);
  const validated = validateFilters(name as any, filters);
  if (!validated.ok) return { ok: false, error: validated.error };
  const { runFetch } = await import("../../convex/catalog/fetch");
  return await runFetch(ctx, {
    name,
    filters,
    ...(limit !== undefined ? { limit } : {}),
    ...(today !== undefined ? { today } : {}),
  });
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

  await it("the most recent law leads a newest-first sort", async () => {
    // A reader asked for the most recent law and got S. 1003; on 2026-08-30 the
    // answer was S. 629. Which law it is moves as Congress acts, so the expected
    // row is the one carrying the set's true maximum action date.
    const r = await fetchViaHandlers(
      ctx,
      "bills",
      { congress: 119, progressStage: 100, sort: "newest_action" },
      50,
    );
    assert.ok(r.ok);
    assert.equal(r.report.complete, true);
    assert.equal(r.report.order, "newest_action_first");
    const latestDate = truth.laws119.reduce(
      (max: string, b: any) => ((b.latestActionDate ?? "") > max ? b.latestActionDate : max),
      "",
    );
    const latestLaws = truth.laws119
      .filter((b: any) => b.latestActionDate === latestDate)
      .map((b: any) => b.billId);
    assert.ok(
      latestLaws.includes(r.rows[0].billId),
      `${latestLaws.join(" or ")} (${latestDate}) must lead a newest-first sort, not ${r.rows[0].billId}`,
    );
    const expectedDates = truth.laws119
      .map((b: any) => b.latestActionDate ?? "")
      .sort()
      .reverse()
      .slice(0, 50);
    assert.deepEqual(
      r.rows.map((b: any) => b.latestActionDate ?? ""),
      expectedDates,
      "every row of the page must be the next-newest law, not only the first",
    );
    assert.equal(r.report.total, truth.laws119.length);
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
    assert.notEqual(houseLaws, truth.laws119.length, "sanity: House laws (64 of 104 on 2026-08-30) are not all the laws");
  });

  await it("the whole-Congress stats row says in words that it covers both chambers", async () => {
    const r = await fetchViaHandlers(ctx, "stats", { congress: 119 });
    assert.ok(r.ok);
    assert.match(r.rows[0].scope, /both chambers/i);
    const statsRow = ctx.db.rowsOf("congressStats").find((s: any) => s.congress === 119);
    assert.ok(statsRow, "no congressStats row for the 119th in the local copy");
    assert.equal(r.rows[0].totalMeasures, statsRow.totalCount);
  });

  // --- A lookup written as text, and the number invented after it -----------
  // A reader was shown a literal fetch_dataset(dataset="bills", filters=
  // {"congress": 119}, limit=0) line and then "the total number of bills
  // introduced in the 119th Congress so far is 1,557". The model never made that
  // call. Had it made it, the handler would not have given it ANY number to
  // quote, and the stats dataset would have given it the real one. Both halves
  // are asserted, so the fix (discard a text-form call, ask again) can only lead
  // to a defensible count.

  await it("1,557 bills introduced in the 119th: the call the model wrote yields no count", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 119 }, 0);
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    assert.equal(r.report.complete, false, "a whole-Congress bills read cannot be complete");
    assert.equal(r.report.total, undefined, "an incomplete read must not carry a number to quote");
  });

  await it("1,557 bills introduced in the 119th: the stats row has the real count", async () => {
    // Against the stored stats row, not a recount of the bills table: the
    // precomputed row can lag a sync, and this case is about what the model
    // would have been handed, not about that lag.
    const statsRow = ctx.db.rowsOf("congressStats").find((s: any) => s.congress === 119);
    assert.ok(statsRow, "no congressStats row for the 119th in the local copy");
    const r = await fetchViaHandlers(ctx, "stats", { congress: 119 });
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    assert.equal(r.report.complete, true);
    assert.equal(r.rows[0].totalMeasures, statsRow.totalCount);
    assert.equal(r.rows[0].houseMeasures + r.rows[0].senateMeasures, statsRow.totalCount);
    assert.notEqual(r.rows[0].totalMeasures, 1557, "the invented number");
  });

  // --- The home page's "party not recorded" seats ---------------------------
  // A reader asked "what are these 11 bills with party not recorded?" about the
  // 117th and was told the figure could not be verified. There was no party
  // filter, the grouped count stopped at 5,000 of 17,828 rows, and the
  // whole-Congress stats row had no party split at all.

  const noParty117 = bills.filter((b: any) => b.congress === 117 && !b.sponsorParty);

  await it("the measures with no party recorded can be listed, completely", async () => {
    assert.ok(noParty117.length > 0, "sanity: the 117th really has measures with no party");
    const r = await fetchViaHandlers(ctx, "bills", { congress: 117, sponsorParty: "none" }, 50);
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    assert.equal(r.report.complete, true, "an indexed party read must be complete");
    assert.equal(r.report.total, noParty117.length);
    assert.deepEqual(
      r.rows.map((row: any) => row.billId).sort(),
      noParty117.map((b: any) => b.billId).sort(),
    );
  });

  await it("the bills gotcha's description of them matches every one", async () => {
    // The gotcha says they are numbers held back for House leadership and tells
    // the model to read whom from the title. A first draft named one title for
    // all eleven; eight of them say "Minority Leader".
    for (const b of noParty117) {
      assert.match(b.title, /^Reserved for the /, `${b.billId} is not a reserved number: ${b.title}`);
      assert.equal(b.billType, "hr", `${b.billId} is not a House number`);
      assert.ok(!b.sponsorLastName, `${b.billId} has a sponsor after all`);
    }
  });

  // Live answer on 2026-09-25, after #126 shipped: "Seven were reserved for the
  // Minority Leader (H.R. 11–17), and four for the Speaker (H.R. 2, 9, 10, and
  // 20)" — H.R. 20 is the Minority Leader's, so the truth is eight and three. It
  // also said each was filed "with no title". The model had all eleven rows and
  // partitioned them by the look of the numbers instead of by their titles.
  // Written out, not parsed: rebuilding production's regex here would agree with it.
  const HOLDER: Record<string, string> = {
    "Reserved for the Speaker.": "Speaker",
    "Reserved for the Minority Leader.": "Minority Leader",
  };
  const reservedFor = (title: string) => HOLDER[title];

  await it("the reserved-number split is counted by the server, not left to the model", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 117, sponsorParty: "none" }, 50);
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    const subsets = r.report.subsets as Array<{ label: string; count: number; members: string[] }>;
    assert.ok(Array.isArray(subsets), "a complete read of reserved numbers must carry the exact split");
    const expected = new Map<string, string[]>();
    for (const b of noParty117) {
      const who = reservedFor(b.title)!;
      expected.set(who, [...(expected.get(who) ?? []), `${b.billTypeLabel} ${b.billNumber}`]);
    }
    assert.equal(subsets.length, expected.size);
    for (const s of subsets) {
      const want = expected.get(s.label.replace(/^reserved for the /, ""));
      assert.ok(want, `unexpected subset '${s.label}'`);
      assert.equal(s.count, want.length, `${s.label}: count`);
      assert.deepEqual([...s.members].sort(), [...want].sort(), `${s.label}: members`);
    }
    assert.ok(
      subsets.some((s) => /Minority Leader/.test(s.label) && s.members.includes("H.R. 20")),
      "H.R. 20 is the Minority Leader's — the number the live answer got wrong",
    );
    for (const row of r.rows) {
      assert.equal(row.reservedFor, reservedFor(row.title), `${row.label}: reservedFor must come from its title`);
    }
    const payload = JSON.parse(payloadFor(r.rows, r.report));
    assert.ok(payload.exact_subsets, "the split must reach the model");
  });

  await it("a set that mixes reserved numbers with real bills carries no split", async () => {
    // From the 118th on, the leaders sponsor their reserved numbers. A split
    // presented as "the whole set" listed seven of Mike Johnson's nine bills.
    for (const [congress, name] of [[119, "Mike Johnson"], [119, "Hakeem Jeffries"], [118, "Kevin McCarthy"]] as const) {
      const r = await fetchViaHandlers(ctx, "bills", { congress, sponsorFilter: [name] }, 50);
      assert.ok(r.ok, `fetch failed: ${r.error}`);
      const theirs = bills.filter(
        (b: any) => b.congress === congress && `${b.sponsorFirstName} ${b.sponsorLastName}`.includes(name.split(" ")[1]),
      );
      assert.ok(
        theirs.some((b: any) => reservedFor(b.title)) && theirs.some((b: any) => !reservedFor(b.title)),
        `sanity: ${name} has both reserved numbers and real bills in the ${congress}th`,
      );
      assert.equal(r.report.subsets, undefined, `${name}: a split of part of the set`);
    }
  });

  // Live answer on 2026-09-25: the 117th's reserved numbers "will almost
  // certainly never become law". The 117th ended on 2023-01-03; they cannot. The
  // prompt already demanded the past tense for ended Congresses, and the model
  // ignored it — so the fact now rides on the row.
  await it("an unfinished bill from an ended Congress says it died, and when", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 117, sponsorParty: "none" }, 50, "2026-09-25");
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    for (const row of r.rows) {
      assert.match(String(row.finalStatus), /Died unfinished .* ended on 2023-01-03/, `${row.label}`);
    }
  });

  await it("a law, a bill still in play, or a fetch with no date carries no death notice", async () => {
    const laws = await fetchViaHandlers(ctx, "bills", { congress: 117, progressStage: 100 }, 10, "2026-09-25");
    assert.ok(laws.ok && laws.rows.length > 0);
    for (const row of laws.rows) assert.equal(row.finalStatus, undefined, `${row.label} became law`);
    const current = await fetchViaHandlers(ctx, "bills", { congress: 119, progressStage: 40 }, 10, "2026-09-25");
    assert.ok(current.ok && current.rows.length > 0);
    for (const row of current.rows) assert.equal(row.finalStatus, undefined, `the 119th is still sitting`);
    // The same 119th bill on the day after it ends is dead.
    const later = await fetchViaHandlers(ctx, "bills", { congress: 119, billType: "hr", progressStage: 40 }, 1, "2027-01-04");
    assert.match(String(later.rows[0].finalStatus), /ended on 2027-01-03/);
    const undated = await fetchViaHandlers(ctx, "bills", { congress: 117, sponsorParty: "none" }, 50);
    for (const row of undated.rows) assert.equal(row.finalStatus, undefined, "no date, no claim");
  });

  await it("the stage a death notice rests on agrees with the actions we hold", async () => {
    // Not a freshness check: stage and actions are written by the same sync, so
    // a bill signed after its last pull would pass this too. That gap is closed
    // in finalStatus itself, which never says "died" of stage 80 — the one stage
    // a bill can leave after adjournment. See the next case.
    const { canBecomeLaw } = await import("../../convex/catalog/measureType");
    const told = new Set(
      bills
        .filter((b: any) => (b.congress === 117 || b.congress === 118) && canBecomeLaw(b.billType) && (b.progressStage ?? 20) < 80)
        .map((b: any) => b.billId),
    );
    assert.ok(told.size > 1000, "sanity: tens of thousands of dead bills");
    const enacted = ctx.db
      .rowsOf("billActions")
      .filter((a: any) => told.has(a.billId) && /Became Public Law|Became Private Law|Signed by President/i.test(a.text))
      .map((a: any) => a.billId);
    assert.deepEqual([...new Set(enacted)], [], "these were enacted but would be told they died");
  });

  await it("a bill that passed both chambers is never told it died", async () => {
    // Review on #129: it can be signed after sine die, and we would not know.
    const r = await fetchViaHandlers(ctx, "bills", { congress: 117, billType: "hr", progressStage: 80 }, 50, "2026-09-25");
    assert.ok(r.ok && r.rows.length > 0, "sanity: the 117th has H.R. bills that passed both chambers");
    for (const row of r.rows) {
      assert.match(String(row.finalStatus), /^Passed both chambers/, `${row.label}`);
      assert.doesNotMatch(String(row.finalStatus), /Died unfinished|can no longer .*become law/, `${row.label}`);
    }
  });

  await it("an adopted resolution is not told it died", async () => {
    // H.Res. 1 of the 117th is the oath-of-office resolution: adopted on day one,
    // stored at stage 20. A first draft told it, and 1,493 more, that they died.
    for (const billId of ["1hres117", "429hres118", "315sres117", "1sconres117", "83hconres118"]) {
      const r = await fetchViaHandlers(ctx, "bills", { billId }, 1, "2026-09-25");
      assert.ok(r.ok && r.rows.length === 1, `${billId} not found`);
      assert.equal(r.rows[0].finalStatus, undefined, `${billId} was told it died`);
    }
  });

  await it("a vetoed bill is not told it died at adjournment", async () => {
    // H.J.Res. 30 of the 118th died when the override failed on 2023-03-23.
    const r = await fetchViaHandlers(ctx, "bills", { billId: "30hjres118" }, 1, "2026-09-25");
    assert.ok(r.ok && r.rows.length === 1);
    assert.match(String(r.rows[0].finalStatus), /^Vetoed and never enacted/);
    assert.doesNotMatch(String(r.rows[0].finalStatus), /Died unfinished/);
  });

  await it("a death notice never says only a later Congress could pass it", async () => {
    // H.R. 3967 of the 117th (the PACT Act) stopped at stage 80, but its text
    // became law in the same Congress inside S. 3373.
    const r = await fetchViaHandlers(ctx, "bills", { billId: "3967hr117" }, 1, "2026-09-25");
    assert.ok(r.ok && r.rows.length === 1);
    assert.doesNotMatch(String(r.rows[0].finalStatus), /later Congress/);
    assert.match(String(r.rows[0].finalStatus), /inside a different bill/);
  });

  await it("an incomplete read carries no split", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 117, sponsorParty: "D" }, 50);
    assert.ok(r.ok);
    assert.equal(r.report.complete, false, "sanity: 10,543 rows are past the cap");
    assert.equal(r.report.subsets, undefined, "a split of a sample is a count we cannot stand behind");
  });

  await it("every reserved number has the title and the action the gotcha says it has", async () => {
    // "Filed with no title" came from a gotcha that said they were "never
    // written". Each has a title and one "Introduced in House" action.
    const actions = ctx.db.rowsOf("billActions");
    for (const b of noParty117) {
      assert.ok(b.title && b.title.length > 0, `${b.billId} has no title`);
      assert.ok(
        actions.some((a: any) => a.billId === b.billId && /^Introduced in House/.test(a.text)),
        `${b.billId} has no "Introduced in House" action`,
      );
    }
    const { DATASETS } = await import("../../convex/catalog/datasets");
    const gotcha = DATASETS.bills.gotchas.find((g: string) => g.includes("sponsorParty"))!;
    assert.doesNotMatch(gotcha, /never written/i, "'never written' became 'filed with no title'");
    assert.match(gotcha, /has a TITLE/, "the gotcha must say each one has a title");
    assert.match(gotcha, /exact_subsets/, "the gotcha must send the split to the server's count");
    assert.doesNotMatch(gotcha, /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|\d+)\b/i,
      "a number in the gotcha can be quoted without a fetch, or carried to the wrong Congress");
  });

  await it("every stored party is one the party filter can reach", async () => {
    // The filter reads D, R, I/ID/IND, and missing or "" (catalog/fetch.ts,
    // PARTY_SPELLINGS). The home page's split files anything else under U, where
    // no filter could list it and the two would disagree. Congress.gov's value
    // is stored raw, so a new spelling shows up here first.
    const reachable = new Set(["D", "R", "I", "ID", "IND", ""]);
    const stray = bills.filter(
      (b: any) => b.sponsorParty !== undefined && !reachable.has(b.sponsorParty),
    );
    assert.equal(
      stray.length,
      0,
      `unreachable sponsorParty values: ${[...new Set(stray.map((b: any) => b.sponsorParty))].join(", ")} ` +
        `— add them to PARTY_SPELLINGS in convex/catalog/fetch.ts`,
    );
  });

  await it("each party filter's total matches the home page's split, in every Congress", async () => {
    const congresses = [...new Set(bills.map((b: any) => b.congress))];
    for (const congress of congresses) {
      const stats = await fetchViaHandlers(ctx, "stats", { congress });
      assert.ok(stats.ok && stats.rows[0].partyCounts, `no party split for the ${congress}th`);
      for (const [filter, key] of [["none", "U"], ["I", "I"]] as const) {
        const r = await fetchViaHandlers(ctx, "bills", { congress, sponsorParty: filter }, 0);
        assert.ok(r.ok, `fetch failed: ${r.error}`);
        assert.equal(r.report.complete, true, `${congress}th ${filter}: read was not complete`);
        assert.equal(
          r.report.total,
          stats.rows[0].partyCounts[key],
          `${congress}th: filter '${filter}' and partyCounts.${key} disagree`,
        );
      }
    }
  });

  await it("asking for them sorted still finds them all", async () => {
    // They are the oldest rows in the Congress, so a newest-first ordering
    // window read without the party index would hold none of them.
    const r = await fetchViaHandlers(
      ctx,
      "bills",
      { congress: 117, sponsorParty: "none", sort: "newest_action" },
      50,
    );
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    assert.equal(r.report.complete, true);
    assert.equal(r.report.total, noParty117.length);
    assert.equal(r.report.order, "newest_action_first");
  });

  await it("a party filter narrows to that party and nothing else", async () => {
    const r = await fetchViaHandlers(ctx, "bills", { congress: 117, sponsorParty: "i" }, 0);
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    assert.equal(r.report.complete, true);
    assert.equal(
      r.report.total,
      bills.filter((b: any) => b.congress === 117 && b.sponsorParty === "I").length,
    );
  });

  await it("the whole-Congress stats row carries the party split the home page shows", async () => {
    const r = await fetchViaHandlers(ctx, "stats", { congress: 117 });
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    const row = r.rows[0];
    assert.ok(row.partyCounts, "no partyCounts on the whole-Congress row");
    assert.equal(row.partyCounts.U, noParty117.length, "U is the 'party not recorded' seats");
    const total = Object.values(row.partyCounts as Record<string, number>).reduce((a, b) => a + b, 0);
    assert.equal(total, row.totalMeasures, "the party split must add up to every measure");
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
    // Accents are folded too: "Nanette Barragan" and "Nanette Barragán" both
    // hold 118th bills, and she is one of California's members, not two.
    const norm = (x: string) =>
      x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
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

  // --- One member, two spellings that differ by more than case ---------------
  //
  // Congress.gov holds four members both with and without their accents, and in
  // the 118th each one is split across the two: "Nydia Velázquez" 22 and "NYDIA
  // VELAZQUEZ" 28. Case-folding alone (the fixes above) leaves them as two
  // people, so "how many bills did Nydia Velázquez introduce in the 118th"
  // answered 22 against a real 50, and the /bills sponsor filter showed her 22.
  const accentFold = (x: string) =>
    x.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  const billsNamed = (congress: number | null, name: string) =>
    bills.filter(
      (b: any) =>
        (congress === null || b.congress === congress) &&
        accentFold(`${b.sponsorFirstName ?? ""} ${b.sponsorLastName ?? ""}`) === accentFold(name),
    ).length;
  const ACCENTED = [
    "Nydia Velázquez",
    "Nydia Velazquez",
    "Nanette Barragán",
    "Jesús García",
    "Jenniffer González-Colón",
  ];

  await it("a member stored with and without accents is counted in full, however the name is typed", async () => {
    for (const name of ACCENTED) {
      const r = await fetchViaHandlers(ctx, "bills", { congress: 118, sponsorFilter: [name] }, 0);
      assert.ok(r.ok, `${name}: ${r.error}`);
      const real = billsNamed(118, name);
      assert.ok(real > 0, `sanity: ${name} really has 118th bills`);
      assert.equal(r.report.total, real, `${name} (118th) missed a spelling`);
    }
  });

  await it("a state's roster counts a member stored with and without accents once", async () => {
    const r = await fetchViaHandlers(
      ctx,
      "sponsors",
      { congress: 118, sponsorState: "NY", sort: "most_bills" },
      100,
    );
    assert.ok(r.ok);
    const people = new Set(
      sponsorRows
        .filter((s: any) => s.congress === 118 && s.sponsorState === "NY")
        .map((s: any) => accentFold(s.sponsorName)),
    );
    assert.equal(r.report.total, people.size, "NY 118 counted spellings, not people");
    const nydia = r.rows.filter((x: any) => accentFold(x.sponsorName) === "nydia velazquez");
    assert.equal(nydia.length, 1, "Velázquez listed more than once");
    assert.equal(nydia[0].billCount, billsNamed(118, "Nydia Velázquez"));
  });

  // The /bills page reads the same rows through bills.ts, not the catalog.
  const billsQueries = await import("../../convex/bills");
  const runQuery = (fn: any, args: Record<string, unknown>) => fn._handler(ctx, args);

  await it("the /bills sponsor filter finds every spelling of a member", async () => {
    for (const name of ACCENTED) {
      const { count, exact } = await runQuery(billsQueries.listCount, {
        congress: 118,
        sponsorFilter: [name],
      });
      assert.equal(exact, true);
      assert.equal(count, billsNamed(118, name), `${name}: /bills count`);
      const page = await runQuery(billsQueries.list, {
        congress: 118,
        sponsorFilter: [name],
        limit: 50,
      });
      assert.equal(page.data.length, Math.min(50, billsNamed(118, name)), `${name}: /bills list`);
    }
  });

  await it("the /bills sponsor picker lists each member once, with all their bills", async () => {
    const list = await runQuery(billsQueries.listAllSponsors, {});
    // Unique on the name alone: it is the option's value, and the filter matches
    // on nothing else, so two entries with one name could not be told apart.
    const seen = new Map<string, any>();
    for (const s of list) {
      const key = accentFold(s.name);
      assert.ok(!seen.has(key), `listed twice: "${seen.get(key)?.name}" and "${s.name}"`);
      seen.set(key, s);
    }
    for (const name of ["Nydia Velázquez", "Adam Schiff", "Barbara Lee", "Christopher Smith"]) {
      const hit = list.filter((s: any) => accentFold(s.name) === accentFold(name));
      assert.equal(hit.length, 1, `${name} not listed exactly once`);
      assert.equal(hit[0].name, name, "a mixed-case spelling exists, so it is the one shown");
      assert.equal(hit[0].billCount, billsNamed(null, name), `${name}: picker count`);
    }
  });

  await it("the home page's leading sponsors are whole members, not one spelling", async () => {
    for (const congress of [117, 118, 119]) {
      const d = await runQuery(billsQueries.getCongressDashboard, { congress });
      for (const s of d?.topSponsors ?? []) {
        const real = bills.filter(
          (b: any) =>
            b.congress === congress &&
            b.sponsorState === s.state &&
            accentFold(`${b.sponsorFirstName ?? ""} ${b.sponsorLastName ?? ""}`) === accentFold(s.name),
        ).length;
        assert.equal(s.count, real, `${congress}: ${s.name}`);
      }
    }
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

  await it("a real topic narrowed to zero by another filter is answered, not refused", async () => {
    // This is the case the spelling check actually has to get right, and the
    // first version of this test did not reach it: a bare {congress, policyArea}
    // for a real topic never has zero matches, so the refusal guard is never
    // entered and the test passed with the fix reverted.
    //
    // Here the topic is real AND the state is real, and the pair is genuinely
    // empty. The guard IS entered, and it must fall through to an honest zero
    // rather than refusing the topic as an unknown spelling.
    const topic = "Foreign Trade and International Finance";
    const state = "WY";
    const realPairCount = bills.filter(
      (b: any) =>
        b.congress === 119 && b.policyAreaName === topic && b.sponsorState === state,
    ).length;
    assert.equal(realPairCount, 0, "fixture: this pair must genuinely have no bills");
    assert.ok(
      bills.some((b: any) => b.congress === 119 && b.policyAreaName === topic),
      "fixture: the topic must be real",
    );
    assert.ok(
      bills.some((b: any) => b.congress === 119 && b.sponsorState === state),
      "fixture: the state must be real",
    );

    const r = await fetchViaHandlers(
      ctx,
      "bills",
      { congress: 119, policyArea: topic, sponsorState: state },
      0,
    );
    assert.ok(r.ok, `a real topic with a real state was refused: ${r.error}`);
    assert.equal(r.report.complete, true);
    assert.equal(r.report.total, 0, "an honest zero, not a refusal and not a guess");
  });

  await it("a real topic MISSING from the precomputed list is still answered", async () => {
    // The guard asks the bills table, not `congressPolicyAreas`, because that
    // table is truncated to the top 50 areas per Congress by an unrelated job.
    // Today all three Congresses hold 31-33 areas so the truncation never bites,
    // which means no query over real data can reach this branch — the condition
    // has to be built to be tested at all. Drop one real topic from the
    // precomputed list and the handler must still answer from the bills table.
    const topic = "Foreign Trade and International Finance";
    const schema = parseSchema(readFileSync("convex/schema.ts", "utf8"));
    const truncated = new FakeDb(
      {
        bills: ctx.db.rowsOf("bills"),
        congressPolicyAreas: ctx.db
          .rowsOf("congressPolicyAreas")
          .filter((t: any) => t.policyAreaName !== topic),
        congressSponsors: ctx.db.rowsOf("congressSponsors"),
      },
      schema,
    );
    assert.ok(
      !truncated.rowsOf("congressPolicyAreas").some((t: any) => t.policyAreaName === topic),
      "fixture: the topic must be absent from the precomputed list",
    );

    const { runFetch } = await import("../../convex/catalog/fetch");
    const r: any = await runFetch({ db: truncated } as any, {
      name: "bills",
      filters: { congress: 119, policyArea: topic, sponsorState: "WY" },
      limit: 0,
    });
    assert.ok(
      r.ok,
      "a topic the precomputed list has dropped was refused as an unknown spelling",
    );
    assert.equal(r.report.total, 0);
  });

  // --- the question that started all of this --------------------------------

  await it("laws by category is ONE fetch, and the groups sum to the total", async () => {
    // "Out of the laws passed give me for each category how many were for each"
    // is the question that opened this whole thread. It needed one fetch per
    // policy area — 31 round trips — so the engine ran out of lookups and shipped
    // the model's own working-out to the reader as the answer.
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      progressStage: 100,
      groupBy: "policyArea",
    });
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    assert.equal(r.report.complete, true);
    assert.equal(r.report.total, truth.laws119.length, "the total must be the measures, not the groups");

    const summed = r.rows.reduce((a: number, x: any) => a + x.count, 0);
    assert.equal(summed, truth.laws119.length, "the groups must account for every law");

    const expected = new Map<string, number>();
    for (const b of truth.laws119) {
      const k = (b as any).policyAreaName ?? "(no policy area assigned)";
      expected.set(k, (expected.get(k) ?? 0) + 1);
    }
    assert.equal(r.rows.length, expected.size, "one row per group");
    for (const row of r.rows) {
      assert.equal(row.count, expected.get(row.group), `${row.group} counted wrong`);
    }
    assert.equal(r.report.order, "largest_first");
    assert.equal(r.rows[0].count, Math.max(...expected.values()), "biggest group first");
  });

  await it("the JSON a grouped fetch actually sends says the rows ARE the whole set", async () => {
    // The handler tests asserted on the raw result and never routed through
    // payloadFor, so nobody had read what the model is really handed. It was
    // being told "you were shown 23 of 104 ... do not describe them as the whole
    // set, and do not rank or compare across the set using only these rows" —
    // false for a breakdown, and a direct contradiction of the request.
    const { payloadFor } = await import("../../convex/catalog/completeness");
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      progressStage: 100,
      groupBy: "policyArea",
    });
    assert.ok(r.ok);
    const payload = JSON.parse(payloadFor(r.rows, r.report));
    assert.equal(
      payload.rows_are_a_sample_of_a_known_total,
      undefined,
      "a complete breakdown must never be described as a page of itself",
    );
    assert.match(String(payload.rows_are_a_complete_breakdown), /whole set/i);
    assert.match(String(payload.rows_are_a_complete_breakdown), /compare or rank/i);
  });

  await it("a genuine PAGE of a complete set is still warned about", async () => {
    // The guard above must not blunt the real one: California's members (54 on
    // 2026-08-30) shown 50 at a time is a page, and reading the last row as "the
    // fewest" is the error that named the wrong member.
    const { payloadFor } = await import("../../convex/catalog/completeness");
    const r = await fetchViaHandlers(ctx, "sponsors", { congress: 119, sponsorState: "CA" }, 50);
    assert.ok(r.ok);
    const payload = JSON.parse(payloadFor(r.rows, r.report));
    assert.ok(truth.caSponsors.length > 50, "sanity: California has more members than one page");
    assert.match(
      String(payload.rows_are_a_sample_of_a_known_total),
      new RegExp(`\\b50 of ${truth.caSponsors.length}\\b`),
    );
    assert.equal(payload.rows_are_a_complete_breakdown, undefined);
  });

  await it("a policy-area group carries a citation that resolves to that topic", async () => {
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      progressStage: 100,
      groupBy: "policyArea",
    });
    const named = r.rows.find((x: any) => x.group !== "(no policy area assigned)");
    assert.ok(named?._cite, "a real topic group must be citable");
    assert.equal(named._cite, `topics:119:${named.group}`);
  });

  await it("grouping never drops rows that have no value for the field", async () => {
    // Folding the unclassified away would make the groups sum to less than the
    // total the same result reports — a self-contradicting answer.
    const r = await fetchViaHandlers(ctx, "bills", { congress: 119, groupBy: "sponsorParty" }, 0);
    if (r.ok && r.report.complete) {
      const summed = r.rows.reduce((a: number, x: any) => a + x.count, 0);
      assert.equal(summed, r.report.total);
    }
    const chamber = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      progressStage: 100,
      groupBy: "chamber",
    });
    assert.ok(chamber.ok);
    const byChamber = Object.fromEntries(chamber.rows.map((x: any) => [x.group, x.count]));
    const houseLaws = truth.laws119.filter((b: any) =>
      ["hr", "hjres", "hconres", "hres"].includes(b.billType),
    ).length;
    assert.equal(byChamber.house, houseLaws, "chamber grouping must match the House law count");
  });

  await it("grouping by a field you already filtered to one value is refused", async () => {
    const r = await fetchViaHandlers(ctx, "bills", {
      congress: 119,
      policyArea: "Health",
      groupBy: "policyArea",
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /grouped by it/i);
  });

  await it("the stats row separates bills from resolutions", async () => {
    // "How many bills have been introduced" had no exact source: 18,476 measures
    // is past any scan ceiling, so counting hr and s came back incomplete, and
    // the one number on hand counted resolutions as bills. Production answered
    // "I could not get an exact count" three times out of three.
    const r = await fetchViaHandlers(ctx, "stats", { congress: 119 });
    assert.ok(r.ok);
    const row = r.rows[0];
    const realBills = bills.filter(
      (b: any) => b.congress === 119 && (b.billType === "hr" || b.billType === "s"),
    ).length;
    if (row.billsOnly === undefined) {
      // The recompute has not run against this copy yet; it must say so rather
      // than let totalMeasures be read as a bill count.
      assert.match(String(row.billsVersusResolutions_unavailable), /not.*count of bills/i);
    } else {
      assert.equal(row.billsOnly, realBills);
      assert.notEqual(row.billsOnly, row.totalMeasures, "bills and measures are different numbers");
      const parts = row.billsOnly + row.jointResolutions + row.otherResolutions;
      assert.equal(parts, row.totalMeasures, "the three parts must account for every measure");
    }
  });

  // --- chamber passage the stage calculator could not see -------------------
  //
  // "H.R. 10326 is in committee." It passed the House 217–207 on 16 Sep 2026.
  // The calculator only knew the phrase "passed House", which the House floor
  // log never uses about a bill, so 3,766 measures that had passed a chamber
  // read "In Committee" or "Introduced" — and 11 whose RULE passed ("Rule
  // H. Res. 864 passed House.") read as if the bill had. The oracle is the
  // Library of Congress's own passage record, read here by hand: code 8000 is
  // "Passed/agreed to in House", 17000 is "Passed/agreed to in Senate".

  const passages = new Map<string, Set<"house" | "senate">>();
  const actionsByBill = new Map<string, any[]>();
  for (const act of ctx.db.rowsOf("billActions") as any[]) {
    const list = actionsByBill.get(act.billId);
    if (list) list.push(act);
    else actionsByBill.set(act.billId, [act]);
    const chamber =
      act.actionCode === "8000" ? "house" : act.actionCode === "17000" ? "senate" : null;
    if (!chamber) continue;
    const seen = passages.get(act.billId) ?? new Set();
    seen.add(chamber);
    passages.set(act.billId, seen);
  }

  await it("the stage calculator counts every chamber passage on record", async () => {
    // The code half: holds as soon as the fix is in, before any backfill.
    const { calculateBillStage } = await import("../../convex/billStage");
    const missed: string[] = [];
    for (const [billId, chambers] of passages) {
      const { stage } = calculateBillStage(actionsByBill.get(billId) ?? []);
      const floor = chambers.size === 2 ? 80 : 60;
      if (stage < floor && stage !== 85) missed.push(`${billId} (${stage})`);
    }
    assert.deepEqual(missed.slice(0, 10), [], `${missed.length} bills under-staged`);
  });

  await it("H.R. 10326 passed the House on 16 Sep 2026; it is not 'in committee'", async () => {
    // The data half: red until production is backfilled and re-dumped.
    const r = await fetchViaHandlers(ctx, "bills", { billId: "10326hr119" });
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    assert.equal(r.rows.length, 1);
    assert.ok(passages.get("10326hr119")?.has("house"), "sanity: the House passage is on record");
    assert.ok(r.rows[0].progressStage >= 60, `stored stage ${r.rows[0].progressStage} says it never left committee`);
  });

  await it("no stored stage sits below a chamber passage on record", async () => {
    const stale: string[] = [];
    for (const b of bills as any[]) {
      const chambers = passages.get(b.billId);
      if (!chambers) continue;
      const floor = chambers.size === 2 ? 80 : 60;
      const stage = b.progressStage ?? 20;
      if (stage < floor && stage !== 85) stale.push(`${b.billId} (${stage})`);
    }
    assert.deepEqual(
      stale.slice(0, 10),
      [],
      `${stale.length} stored stages are behind the actions — run backfillBillFieldsFromActions`,
    );
  });

  // --- the invariant, checked across many shapes ----------------------------

  // "Summarize H.R. 1 in two sentences." came back BLANK on 2026-10-05: its
  // summary versions are about 150,000 tokens together, more than the model's
  // whole context window, so the request was refused and the reader got nothing.
  await it("H.R. 1's summaries fit in one request, and say they are only the opening", async () => {
    const { SUMMARY_MAX_CHARS } = await import("../../convex/catalog/fetch");
    const raw = ctx.db.rowsOf("billSummaries").filter((s: any) => s.billId === "1hr119");
    assert.ok(raw.some((s: any) => s.text.length > 100_000), "sanity: H.R. 1 has a huge summary");
    const r = await fetchViaHandlers(ctx, "bill_summaries", { billId: "1hr119" });
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    assert.ok(r.rows.length > 0);
    const chars = JSON.stringify(r.rows).length;
    assert.ok(chars < 60_000, `H.R. 1's summaries still hand the model ${chars} characters`);
    for (const row of r.rows) {
      assert.ok(row.text.length <= SUMMARY_MAX_CHARS, `${row.describes}: ${row.text.length} characters`);
      if (row.textIsOpeningOnly) assert.ok(row.fullTextLength > SUMMARY_MAX_CHARS);
    }
    assert.ok(r.rows.some((row: any) => row.textIsOpeningOnly === true), "no row says it was cut");
  });

  await it("an ordinary summary reaches the model whole and unmarked", async () => {
    const raw = ctx.db
      .rowsOf("billSummaries")
      .find((s: any) => s.text.length > 400 && s.text.length < 2000);
    assert.ok(raw, "sanity: there are ordinary summaries");
    const r = await fetchViaHandlers(ctx, "bill_summaries", { billId: raw.billId });
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    const same = r.rows.find((row: any) => row.text === raw.text);
    assert.ok(same, "the short summary was altered");
    assert.equal(same.textIsOpeningOnly, undefined);
  });

  // "Are any 118th-Congress bills still sitting in committee?" was answered YES
  // on 2026-10-05: the model fetched the stage-40 COUNT, which has no rows to
  // carry the per-bill "died in committee" note, and read the number as alive.
  await it("a count from an ended Congress says it is over; a live one does not", async () => {
    const { payloadFor } = await import("../../convex/catalog/completeness");
    const ended = await fetchViaHandlers(ctx, "bills", { congress: 118, progressStage: 40 }, 0, "2026-10-05");
    assert.ok(ended.ok, `fetch failed: ${ended.error}`);
    assert.equal(ended.rows.length, 0, "a count-only lookup has no rows to carry the note");
    const said = JSON.parse(payloadFor(ended.rows, ended.report));
    assert.match(said.congress_is_over ?? "", /118th Congress ended on 2025-01-03[\s\S]*answer no/);
    const live = await fetchViaHandlers(ctx, "bills", { congress: 119, progressStage: 40 }, 0, "2026-10-05");
    assert.ok(live.ok);
    assert.equal(JSON.parse(payloadFor(live.rows, live.report)).congress_is_over, undefined);
  });

  // "Of the laws enacted in the 119th, how many started in the Senate?" got 42
  // on 2026-10-05 from billType 's', which drops the Senate joint resolutions
  // that also became law. The chamber filter counts both.
  await it("the Senate's laws are every Senate type, which the chamber filter counts", async () => {
    const senateLaws = bills.filter(
      (b: any) => b.congress === 119 && b.progressStage === 100 && /^s/.test(b.billType),
    ).length;
    const sOnly = bills.filter(
      (b: any) => b.congress === 119 && b.progressStage === 100 && b.billType === "s",
    ).length;
    assert.ok(senateLaws > sOnly, "sanity: some Senate joint resolutions became law");
    const r = await fetchViaHandlers(ctx, "bills", { congress: 119, progressStage: 100, chamber: "senate" }, 0);
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    assert.equal(r.report.total, senateLaws);
  });

  // "Which California member has introduced the fewest bills?" got "the exact
  // name cannot be determined" on 2026-10-05: the model asked for a count only
  // and stopped. The count-only result must say how to get the name, and the
  // fetch it points to must return the true minimum first.
  await it("a count-only lookup points at the fetch that names the fewest", async () => {
    const { payloadFor } = await import("../../convex/catalog/completeness");
    const filters = { congress: 119, sponsorState: "CA", sort: "fewest_bills" };
    const counted = await fetchViaHandlers(ctx, "sponsors", filters, 0);
    assert.ok(counted.ok, `fetch failed: ${counted.error}`);
    assert.match(JSON.parse(payloadFor(counted.rows, counted.report)).count_only ?? "", /limit of 1/);
    const named = await fetchViaHandlers(ctx, "sponsors", filters, 1);
    assert.ok(named.ok);
    const fewest = Math.min(...truth.caSponsors.map((s: any) => s.billCount));
    assert.equal(named.rows[0].billCount, fewest);
  });

  // "whats the latest bill that passed as law" got the Secure America Act (S. 2,
  // last action June 2026) live on 2026-10-05. The model put `sort` beside
  // `filters`, the handler never saw it, and one arbitrary row came back.
  await it("the live latest-law call, sort beside filters, returns the newest law", async () => {
    const { filtersFromCall } = await import("../../convex/catalog/filters");
    const args = {
      name: "bills",
      filters: { congress: 119, progressStage: 100 },
      sort: "newest_action",
      limit: 1,
    };
    const r = await fetchViaHandlers(ctx, "bills", filtersFromCall("bills", args) as any, 1);
    assert.ok(r.ok, `fetch failed: ${r.error}`);
    assert.notEqual(r.report.order, "arbitrary", "the sort was dropped again");
    const newest = truth.laws119.reduce((a: any, b: any) =>
      (b.latestActionDate ?? "") > (a.latestActionDate ?? "") ? b : a,
    );
    assert.equal(r.rows[0].latestActionDate, newest.latestActionDate);
    assert.notEqual(r.rows[0].billId, "2s119");
  });

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
