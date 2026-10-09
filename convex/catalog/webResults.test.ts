/**
 * The web-result filter. Every URL below is one the search engine really
 * returned to the answer engine in October 2026 — the result shapes that came
 * back, not invented ones. The headline case is H.R. 10725, whose page described
 * H.R. 9707 (the other "GAP Act") to a reader.
 */
import assert from "node:assert/strict";
import {
  billRefFromId,
  billRefsIn,
  billsInScope,
  describeBillRef,
  keepWebResultsForBill,
  withheldNote,
} from "./webResults";

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

const hit = (url: string, title = "") => ({ url, title });
const urlsKept = (hits: Array<{ url: string; title: string }>, query: string, page?: string) =>
  keepWebResultsForBill(hits, billsInScope(query, page)).kept.map((h) => h.url);

// --- reading references ---------------------------------------------------

const READS: Array<[string, string, number, number | undefined]> = [
  ["https://www.congress.gov/bill/119th-congress/house-bill/9707", "hr", 9707, 119],
  ["https://www.congress.gov/bill/119th-congress/s/5283", "s", 5283, 119],
  ["https://www.congress.gov/bill/93rd-congress/house-bill/10717", "hr", 10717, 93],
  ["https://www.congress.gov/119/bills/hr9707/BILLS-119hr9707ih.htm", "hr", 9707, 119],
  ["https://www.govinfo.gov/app/details/BILLS-119hr9494ih", "hr", 9494, 119],
  ["https://www.quiverquant.com/bills/119/hr-9494", "hr", 9494, 119],
  ["https://legilist.com/bill/119/hr/9707", "hr", 9707, 119],
  ["https://www.govtrack.us/congress/bills/93/hr10717", "hr", 10717, 93],
  ["https://govscent.org/bill/USA/119s5427is", "s", 5427, 119],
  ["https://www.bill100.com/bills/119-s-5427", "s", 5427, 119],
  ["https://policybrief.co/legislation/hr9523-119", "hr", 9523, 119],
  ["https://www.civicgate.org/bill/s-2120-119", "s", 2120, 119],
  ["https://myreptracker.com/united-states/bills/us-119th-sres-921", "sres", 921, 119],
  ["https://openamerica.io/bill/119-HRES-1603/", "hres", 1603, 119],
  ["https://app.legiplex.com/us/legislature/2025/us119/bills/sb2641", "s", 2641, undefined],
  ["https://www.c-span.org/congress/bills/bill/?119%2Fhr10725=", "hr", 10725, 119],
  ["https://poliscore.us/2026/bill/hr/10763", "hr", 10763, undefined],
  ["https://ailawtracker.org/bills/congress-119-hr-9323", "hr", 9323, 119],
  ["H.R.9707 - 119th Congress (2025-2026): GAP Act", "hr", 9707, 119],
  ["https://example.org/news/Rep+introduces+H.R.+10571%3A+Surge+to+Save+Newborns+Act", "hr", 10571, undefined],
  ["S.J.Res. 12 disapproval", "sjres", 12, undefined],
  ["H. Con. Res. 4", "hconres", 4, undefined],
];

for (const [text, type, number, congress] of READS) {
  it(`reads ${text}`, () => {
    const refs = billRefsIn(text);
    assert.ok(
      refs.some((r) => r.type === type && r.number === number && r.congress === congress),
      `got ${JSON.stringify(refs)}`,
    );
  });
}

it("reads this site's own bill URLs by our id, not as H.R. 119", () => {
  assert.deepEqual(billRefsIn("https://billsincongress.com/bills/10543hr119"), [
    { type: "hr", number: 10543, congress: 119 },
  ]);
});

const NO_BILL = [
  "https://www.rickscott.senate.gov/services/files/5606DA2A-AE5B-4DDE-8904-3072504CE8E0",
  "https://underwood.house.gov/sites/evo-subsites/underwood.house.gov/files/119th-momnibus-section-by-section-1.pdf",
  "https://www.govinfo.gov/content/pkg/CRPT-110hrpt28/html/CRPT-110hrpt28-pt3.htm",
  "https://caselaw.findlaw.com/court/us-2nd-circuit/1630224.html",
  "https://wassermanschultz.house.gov/news/documentsingle.aspx?DocumentID=3527",
  "Title 42 U.S.C. 1395 and U.S. 2026 midterms",
  "America's 250th anniversary",
  "https://fedscoop.com/wp-content/uploads/sites/5/2026/05/report.pdf",
];
for (const text of NO_BILL) {
  it(`reads no bill in ${text}`, () => {
    assert.deepEqual(billRefsIn(text), []);
  });
}

it("parses a bill id", () => {
  assert.deepEqual(billRefFromId("10725hr119"), { type: "hr", number: 10725, congress: 119 });
  assert.deepEqual(billRefFromId("921sres119"), { type: "sres", number: 921, congress: 119 });
  assert.equal(billRefFromId("not-a-bill"), null);
});

// --- the cases readers hit -------------------------------------------------

it("H.R. 10725's page never gets H.R. 9707's pages (the other GAP Act)", () => {
  const hits = [
    hit("https://www.quiverquant.com/bills/119/hr-10725"),
    hit("https://www.c-span.org/congress/bills/bill/?119%2Fhr10725="),
    hit("https://www.congress.gov/bill/119th-congress/house-bill/9707"),
    hit("https://legilist.com/bill/119/hr/9707"),
    hit("https://www.congress.gov/119/bills/hr9707/BILLS-119hr9707ih.htm"),
  ];
  assert.deepEqual(urlsKept(hits, "H.R. 10725 GAP Act summary", "10725hr119"), [
    "https://www.quiverquant.com/bills/119/hr-10725",
    "https://www.c-span.org/congress/bills/bill/?119%2Fhr10725=",
  ]);
});

it("a search by short title alone still uses the open bill", () => {
  // The model searched "GAP Act foreign adversary investments general aviation"
  // on H.R. 10725's page: every result was H.R. 9707's or named no bill.
  const hits = [
    hit("https://www.congress.gov/bill/119th-congress/house-bill/9707"),
    hit("https://www.govinfo.gov/app/details/BILLS-119hr9707ih"),
    hit("https://harriganforms.house.gov/uploadedfiles/harrig_067_xml_finl.pdf"),
  ];
  assert.deepEqual(urlsKept(hits, "GAP Act foreign adversary investments general aviation", "10725hr119"), [
    "https://harriganforms.house.gov/uploadedfiles/harrig_067_xml_finl.pdf",
  ]);
});

it("the 93rd Congress's H.R. 10717 is not the 119th's", () => {
  const hits = [
    hit("https://www.govtrack.us/congress/bills/93/hr10717/summary"),
    hit("https://www.quiverquant.com/bills/119/hr-10717"),
    hit("https://www.congress.gov/bill/93rd-congress/house-bill/10717"),
    hit("https://www.bill100.com/bills/119-hr-10717"),
  ];
  assert.deepEqual(urlsKept(hits, "H.R. 10717 summary", "10717hr119"), [
    "https://www.quiverquant.com/bills/119/hr-10717",
    "https://www.bill100.com/bills/119-hr-10717",
  ]);
});

it("five pages about five other bills all go", () => {
  const hits = [
    hit("https://app.legiplex.com/us/legislature/2025/us119/bills/hr1077/legislators"),
    hit("https://www.quiverquant.com/bills/119/hr-10721"),
    hit("https://www.quiverquant.com/bills/119/hr-10747"),
    hit("https://www.quiverquant.com/bills/119/hr-10737"),
    hit("https://hillgraph.com/bills/119-hr-10707"),
  ];
  assert.deepEqual(urlsKept(hits, "H.R. 10761 sponsor"), []);
});

it("a Senate page does not take a same-titled House bill", () => {
  const hits = [
    hit("https://www.govtrack.us/congress/bills/119/hr2347/summary"),
    hit("https://waysandmeans.house.gov/wp-content/uploads/2026/03/H.R.-2347-One-Pager.pdf"),
    hit("https://example.org/survivor-justice-tax-prevention-act-explained"),
  ];
  assert.deepEqual(urlsKept(hits, "Survivor Justice Tax Prevention Act summary", "5395s119"), [
    "https://example.org/survivor-justice-tax-prevention-act-explained",
  ]);
});

it("a page naming the bill in its title is kept even if its URL names another", () => {
  const hits = [hit("https://example.org/compare/hr9707", "H.R. 10725 and H.R. 9707 compared")];
  assert.equal(urlsKept(hits, "", "10725hr119").length, 1);
});

it("a companion the model names in its query is searchable from a bill page", () => {
  const hits = [
    hit("https://www.congress.gov/bill/119th-congress/house-bill/2347"),
    hit("https://www.congress.gov/bill/119th-congress/senate-bill/5395"),
  ];
  assert.deepEqual(urlsKept(hits, "H.R. 2347 Survivor Justice Tax Prevention Act", "5395s119"), [
    "https://www.congress.gov/bill/119th-congress/house-bill/2347",
    "https://www.congress.gov/bill/119th-congress/senate-bill/5395",
  ]);
});

it("a rule's own pages survive a query that names the bill it governs", () => {
  // Found against production: 42 same-titled resolution pairs lost their own
  // pages when the query was the rule's title, which names another bill.
  const hits = [
    hit("https://www.congress.gov/bill/119th-congress/house-resolution/184"),
    hit("https://www.congress.gov/bill/119th-congress/house-resolution/278"),
  ];
  assert.deepEqual(
    urlsKept(hits, "Providing for consideration of the bill (H.R. 1234) summary", "184hres119"),
    ["https://www.congress.gov/bill/119th-congress/house-resolution/184"],
  );
});

it("this site's own page for the bill is kept", () => {
  const hits = [
    hit("https://legilist.com/bill/119/hr/10543"),
    hit("https://billsincongress.com/bills/10543hr119"),
  ];
  assert.equal(urlsKept(hits, "H.R. 10543 PREP Act summary", "10543hr119").length, 2);
});

it("off a bill page, the bill id in the model's reason sets the scope", () => {
  const hits = [
    hit("https://www.govtrack.us/congress/bills/119/s3012/summary"),
    hit("https://www.congress.gov/119/bills/hr7137/BILLS-119hr7137ih.htm"),
    hit("http://www.congress.gov/bill/119th-congress/senate-bill/3168"),
  ];
  const scope = billsInScope(
    "Shutdown Fairness Act summary",
    undefined,
    "We don't have the official summary for bill 3168s119 in our data",
  );
  assert.deepEqual(
    keepWebResultsForBill(hits, scope).kept.map((h) => h.url),
    ["http://www.congress.gov/bill/119th-congress/senate-bill/3168"],
  );
});

it("a date in a news URL is not read as a Congress", () => {
  // Review finding on #181: `/10/08/hr-10725` parsed as the 8th Congress's bill,
  // so a page about the right bill was dropped as "a different bill".
  const hits = [
    hit("https://example-news.com/2026/10/08/hr-10725-gap-act-medicare"),
    hit("https://thehill.com/policy/healthcare/2026/10/hr10725-explained"),
  ];
  assert.equal(urlsKept(hits, "H.R. 10725 GAP Act summary", "10725hr119").length, 2);
});

it("a search for an earlier Congress's version is not pinned to the open bill", () => {
  // Review finding on #181: on H.R. 10725's page, "GAP Act Medicare 116th
  // Congress" had every 116th-Congress result removed.
  const hits = [
    hit("https://www.congress.gov/bill/116th-congress/house-bill/4321"),
    hit("https://www.govtrack.us/congress/bills/116/hr4321"),
  ];
  assert.equal(urlsKept(hits, "GAP Act Medicare 116th Congress", "10725hr119").length, 2);
  // The same Congress as the open bill keeps the filter on.
  assert.equal(urlsKept(hits.slice(0, 1), "GAP Act 119th Congress", "10725hr119").length, 0);
});

it("an earlier-version search still drops the same-titled bill of the open bill's own Congress", () => {
  // Review finding on #181: with that search unfiltered, H.R. 9707 (119th, the
  // other GAP Act) could be presented as this bill's earlier version.
  const hits = [
    hit("https://www.congress.gov/bill/119th-congress/house-bill/9707", "H.R.9707 - GAP Act"),
    hit("https://www.congress.gov/bill/116th-congress/house-bill/4321"),
    hit("https://www.quiverquant.com/bills/119/hr-10725"),
    hit("https://example.org/gap-act-history"),
  ];
  assert.deepEqual(urlsKept(hits, "GAP Act Medicare 116th Congress", "10725hr119"), [
    "https://www.congress.gov/bill/116th-congress/house-bill/4321",
    "https://www.quiverquant.com/bills/119/hr-10725",
    "https://example.org/gap-act-history",
  ]);
});

it("the note to the model is neutral and says what was kept", () => {
  const plain = withheldNote(billsInScope("GAP Act", "10725hr119"), 3);
  assert.match(plain, /^3 result\(s\) named only bills other than H\.R\. 10725 \(119th Congress\)/);
  assert.match(plain, /not evidence the web has nothing/);
  const earlier = withheldNote(billsInScope("GAP Act 116th Congress", "10725hr119"), 1);
  assert.match(earlier, /other 119th-Congress bills, which cannot be an earlier version of H\.R\. 10725/);
});

it("describes what the filter kept, for the model's note", () => {
  assert.equal(describeBillRef({ type: "hr", number: 10725, congress: 119 }), "H.R. 10725 (119th Congress)");
  assert.equal(describeBillRef({ type: "sjres", number: 12, congress: 112 }), "S.J.Res. 12 (112th Congress)");
  assert.equal(describeBillRef({ type: "s", number: 5 }), "S. 5");
});

it("with no bill in scope nothing is filtered", () => {
  const hits = [hit("https://www.congress.gov/bill/119th-congress/house-bill/9707")];
  assert.equal(urlsKept(hits, "Older Americans Act opposition").length, 1);
});

it("results that name no bill are kept", () => {
  const hits = [
    hit("https://www.wyden.senate.gov/imo/media/doc/srs_extension_legislative_text.pdf"),
    hit("https://www.naco.org/news/us-senators-introduce-bipartisan-bill-reauthorize-secure-rural-schools"),
  ];
  assert.equal(urlsKept(hits, "S. 5607 summary", "5607s119").length, 2);
});

if (failures.length > 0) {
  console.error(`webResults.test.ts — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`webResults.test.ts — ${passed} passed`);
