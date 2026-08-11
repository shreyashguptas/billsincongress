/**
 * Unit tests for recognising a bill reference typed into the search box.
 *
 * Every "recognises" case below is a verbatim query from the bills_no_results
 * logs — a real person who typed that and was told no bill exists. The
 * "leaves alone" cases guard the other direction: a title search that happens
 * to contain digits must not be hijacked into a number lookup.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { parseBillReference } from "./bill-query";

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`,
    );
  }
}

/** Asserts the query resolves to exactly this type and number. */
function recognises(query: string, billType: string | null, billNumber: string) {
  it(`recognises ${JSON.stringify(query)} as ${billType ?? "(any type)"} ${billNumber}`, () => {
    assert.deepEqual(parseBillReference(query), { billType, billNumber });
  });
}

/** Asserts the query is left for the text search. */
function leavesAlone(query: string) {
  it(`leaves ${JSON.stringify(query)} to the title search`, () => {
    assert.equal(parseBillReference(query), null);
  });
}

// --- real failing queries from the logs -----------------------------------

recognises("HR 7540", "hr", "7540");
recognises("H.R. 6662", "hr", "6662");
recognises("h.r 7865", "hr", "7865");
recognises("hr 5430", "hr", "5430");
recognises("HR 1229", "hr", "1229");
recognises("Hr88", "hr", "88");
recognises("H B 8344", "hr", "8344");
recognises("Hb 2611", "hr", "2611");
recognises("s 29", "s", "29");
recognises("S.935", "s", "935");
recognises("s.4784", "s", "4784");
recognises("h. con. res. 113", "hconres", "113");
recognises("9244", null, "9244");
recognises("6047", null, "6047");
recognises("219", null, "219");
recognises("3855", null, "3855");
recognises("7256", null, "7256");
recognises("The Bill, H1232", "hr", "1232");

// --- formatting tolerance -------------------------------------------------

recognises("  hr 9237  ", "hr", "9237");
recognises("HR9237", "hr", "9237");
recognises("h.r.9237", "hr", "9237");
recognises("bill hr 9237", "hr", "9237");
recognises("S. 4784", "s", "4784");

// --- every congressional bill type ----------------------------------------

recognises("hres 1470", "hres", "1470");
recognises("sres 817", "sres", "817");
recognises("hjres 142", "hjres", "142");
recognises("sjres 33", "sjres", "33");
recognises("hconres 113", "hconres", "113");
recognises("sconres 7", "sconres", "7");
recognises("h.j.res. 142", "hjres", "142");
recognises("hcr 113", "hconres", "113");
recognises("sjr 33", "sjres", "33");

// --- alias mapping is deliberate -----------------------------------------

it("maps the state-legislature habits HB and SB onto H.R. and S.", () => {
  assert.deepEqual(parseBillReference("HB 100"), { billType: "hr", billNumber: "100" });
  assert.deepEqual(parseBillReference("SB 100"), { billType: "s", billNumber: "100" });
});

// --- must NOT hijack a title search --------------------------------------

leavesAlone("NDAA");
leavesAlone("KOSA");
leavesAlone("sunshine protection act");
leavesAlone("student");
leavesAlone("medicare mnt");
leavesAlone("property tax");
leavesAlone("9/11 commission");
leavesAlone("section 8 housing");
leavesAlone("covid 19");
leavesAlone("2025 reconciliation bills status");
leavesAlone("Bill 217-198"); // six digits once compacted — ambiguous, not a lookup
leavesAlone("hr"); // a type with no number is not a reference
leavesAlone("act 2025 something");
leavesAlone("");
leavesAlone("   ");

it("does not treat a leading-zero number as a bill number", () => {
  // No stored bill number carries a leading zero, so this is not a reference.
  assert.equal(parseBillReference("hr 0123"), null);
});

it("does not swallow digit strings longer than five", () => {
  assert.equal(parseBillReference("123456"), null);
});

// --- boundaries ----------------------------------------------------------

recognises("hr 1", "hr", "1");
recognises("hr 99999", "hr", "99999");
recognises("5", null, "5");

if (failures.length > 0) {
  console.error(`\nbillQuery: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`billQuery: all ${passed} tests passed`);
