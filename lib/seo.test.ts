/**
 * Unit tests for bill page SEO prose.
 *
 * The load-bearing property is the first group: a bill page's <title> and its
 * meta description must never be the bill's own title echoed back. That is what
 * they WERE — `latest_summary || title` collapsed to the title on the ~4 in 5
 * bills Congress has not summarised yet — and Bing measured the result as
 * thousands of top-five impressions with zero clicks.
 *
 * The second group guards the CRS title echo: their summaries open with the
 * bill's short title, so a description built naively from the summary also began
 * by repeating the <title>.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import {
  billAnswerParagraph,
  billIdentifier,
  billSeoDescription,
  billSeoTitle,
  billStatusPhrase,
  billSummaryText,
} from "./seo";
import type { Bill } from "./types/bill";
import { POLICY_AREAS } from "./constants/filters";

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

/** A bill with no CRS summary — the common case, and the one that was broken. */
function bareBill(over: Partial<Bill> = {}): Bill {
  return {
    id: "5213s119",
    congress: 119,
    bill_type: "s",
    bill_number: "5213",
    bill_type_label: "S.",
    introduced_date: "2026-08-03",
    title: "SMASH 2.0 Act",
    sponsor_first_name: "Angus",
    sponsor_last_name: "King",
    sponsor_party: "I",
    sponsor_state: "ME",
    progress_stage: 40,
    progress_description: "In Committee",
    bill_subjects: { policy_area_name: "Health" },
    ...over,
  } as Bill;
}

// ── The regression this change exists to prevent ───────────────────────────

it("description is not merely the bill title", () => {
  const bill = bareBill();
  const d = billSeoDescription(bill);
  assert.notEqual(d.trim(), bill.title);
  assert.ok(!d.startsWith(bill.title), `description opens by echoing the title: ${d}`);
});

it("description of a summary-less bill is a real sentence, not a fragment", () => {
  const d = billSeoDescription(bareBill());
  assert.ok(d.length >= 110, `only ${d.length} chars: ${d}`);
  assert.ok(d.length <= 158, `${d.length} chars exceeds the snippet budget: ${d}`);
});

it("description states the status, because that is what the queries ask", () => {
  assert.match(billSeoDescription(bareBill()), /in committee/i);
  assert.match(
    billSeoDescription(bareBill({ progress_stage: 100, progress_description: "Became Law" })),
    /became law/i,
  );
});

it("description names the identifier, sponsor, date and policy area", () => {
  const d = billSeoDescription(bareBill());
  assert.match(d, /S\. 5213/);
  assert.match(d, /King/);
  assert.match(d, /2026/);
  assert.match(d, /Health/);
});

it("title carries the status so it survives SERP truncation", () => {
  const t = billSeoTitle(bareBill());
  assert.match(t, /^S\. 5213 — In committee/);
  assert.ok(t.indexOf("In committee") < 30, `status too deep in the title: ${t}`);
});

it("every stage produces a distinct human status phrase", () => {
  const stages = [20, 40, 60, 80, 85, 90, 95, 100];
  const seen = new Set(stages.map((s) => billStatusPhrase(bareBill({ progress_stage: s }))));
  assert.equal(seen.size, stages.length, `collisions among ${[...seen].join(" / ")}`);
});

it("an unknown stage falls back to the backend's own description", () => {
  const bill = bareBill({ progress_stage: 55, progress_description: "Reported by Committee" });
  assert.equal(billStatusPhrase(bill), "Reported by Committee");
});

// ── The CRS title echo ─────────────────────────────────────────────────────

it("summary text drops the CRS echo of the bill's own title", () => {
  const bill = bareBill({
    title: "Secure America Act",
    latest_summary:
      "<p><strong>Secure America Act</strong></p><p>This act provides $70 billion in&nbsp;funding to DHS.</p>",
  });
  const s = billSummaryText(bill);
  assert.ok(s.startsWith("This act provides"), `echo not stripped: ${s}`);
  assert.ok(!s.includes("<p>"), "markup survived");
  assert.ok(!s.includes("&nbsp;"), "entity survived");
});

it("a summarised bill's description leads with status then substance", () => {
  const bill = bareBill({
    title: "Secure America Act",
    progress_stage: 100,
    progress_description: "Became Law",
    latest_summary:
      "<p><strong>Secure America Act</strong></p><p>This act provides $70 billion in funding to DHS.</p>",
  });
  const d = billSeoDescription(bill);
  assert.match(d, /^S\. 5213 — became law\. This act provides/);
});

it("a summary that does not echo the title is left intact", () => {
  const bill = bareBill({
    title: "SMASH 2.0 Act",
    latest_summary: "<p>Directs the Secretary to establish a grant program.</p>",
  });
  assert.equal(billSummaryText(bill), "Directs the Secretary to establish a grant program.");
});

it("no summary yields empty text, so the caller can branch", () => {
  assert.equal(billSummaryText(bareBill()), "");
  assert.equal(billSummaryText(bareBill({ latest_summary: "" })), "");
});

// ── The on-page paragraph ──────────────────────────────────────────────────

it("answer paragraph says what the bill is and where it stands", () => {
  const p = billAnswerParagraph(bareBill());
  assert.match(p, /S\. 5213 is a Health bill/);
  assert.match(p, /119th Congress/);
  assert.match(p, /Senate/);
  assert.match(p, /August 3, 2026/);
  assert.match(p, /King \(I-ME\)/);
  assert.match(p, /in committee/i);
});

it("answer paragraph admits the missing summary rather than implying none exists", () => {
  assert.match(billAnswerParagraph(bareBill()), /not published a plain-language summary/i);
});

it("answer paragraph omits the summary caveat once a summary exists", () => {
  const bill = bareBill({ latest_summary: "<p>Directs the Secretary to act.</p>" });
  assert.ok(!/not published/i.test(billAnswerParagraph(bill)));
});

it("House bills are described as House bills", () => {
  const bill = bareBill({ bill_type: "hr", bill_type_label: "H.R.", bill_number: "9237" });
  assert.match(billAnswerParagraph(bill), /House/);
  assert.ok(!/Senate/.test(billAnswerParagraph(bill)));
});

// ── Keeping the descriptive long title, which is real content ──────────────

it("a formal long title is kept and prefixed with the status", () => {
  const bill = bareBill({
    title: "To require the disclosure of algorithmic price fixing in the housing rental market, and for other purposes.",
  });
  const d = billSeoDescription(bill);
  assert.match(d, /^H?S?\.? ?5213? — in committee\. To require the disclosure of algorithmic price fixing/);
  assert.ok(d.includes("algorithmic price fixing"), `lost the bill's actual subject: ${d}`);
});

it("a bare act name is replaced by facts, not echoed", () => {
  const d = billSeoDescription(bareBill({ title: "SMASH 2.0 Act" }));
  assert.ok(!d.includes("SMASH 2.0 Act"), `echoed the act name: ${d}`);
  assert.match(d, /introduced August 3, 2026/);
});

it("a long act name counts as descriptive rather than a bare name", () => {
  const long = "Servicemember Mental Health Assistance and Support Improvement Act of 2026";
  const d = billSeoDescription(bareBill({ title: long }));
  assert.ok(d.includes("Servicemember Mental Health"), d);
  assert.match(d, /— in committee\./);
});

it("the status always precedes the title content", () => {
  const bill = bareBill({ title: "To amend title 38, United States Code, to improve benefits." });
  const d = billSeoDescription(bill);
  assert.ok(d.indexOf("in committee") < d.indexOf("To amend"), d);
});

it("a resolution is called a resolution, not a bill", () => {
  const res = bareBill({
    bill_type: "hres",
    bill_type_label: "H.Res.",
    bill_number: "1484",
    bill_subjects: undefined,
  });
  assert.match(billSeoDescription(res), /H\.Res\. 1484 is a resolution in the House/);
  assert.match(billAnswerParagraph(res), /is a resolution/);
  assert.ok(!/is a bill/.test(billAnswerParagraph(res)));
});

it("joint and concurrent resolutions get their own wording", () => {
  const joint = bareBill({ bill_type: "sjres", bill_type_label: "S.J.Res.", bill_subjects: undefined });
  assert.match(billSeoDescription(joint), /is a joint resolution/);
  const conc = bareBill({ bill_type: "hconres", bill_type_label: "H.Con.Res.", bill_subjects: undefined });
  assert.match(billSeoDescription(conc), /is a concurrent resolution/);
});

it("the policy area still qualifies a resolution", () => {
  const res = bareBill({
    bill_type: "hres",
    bill_type_label: "H.Res.",
    bill_subjects: { policy_area_name: "Immigration" },
  });
  assert.match(billSeoDescription(res), /is an Immigration resolution/);
});

// ── Degrading gracefully on incomplete records ─────────────────────────────

it("a bill with no sponsor still produces prose", () => {
  const bill = bareBill({
    sponsor_first_name: "",
    sponsor_last_name: "",
    sponsor_party: "",
    sponsor_state: "",
  });
  const d = billSeoDescription(bill);
  assert.ok(!d.includes("()"), `empty sponsor parens: ${d}`);
  assert.ok(!d.includes(" by ."), `dangling by: ${d}`);
  assert.match(d, /S\. 5213/);
  assert.match(billAnswerParagraph(bill), /in committee/i);
});

it("a bill with no policy area still produces prose", () => {
  const bill = bareBill({ bill_subjects: undefined });
  assert.match(billSeoDescription(bill), /S\. 5213 is a bill/);
  assert.ok(!billSeoDescription(bill).includes("undefined"));
});

it("a bill with an unparseable date omits the date rather than printing junk", () => {
  const bill = bareBill({ introduced_date: "not-a-date" });
  const d = billSeoDescription(bill);
  assert.ok(!/Invalid Date|NaN/.test(d), d);
  assert.ok(!/introduced\s*\./.test(d), `dangling introduced: ${d}`);
});

it("a bill with no title still yields a usable title tag", () => {
  const t = billSeoTitle(bareBill({ title: "" }));
  assert.match(t, /^S\. 5213 — In committee \(119th Congress\)$/);
});

it("identifier is the searched form", () => {
  assert.equal(billIdentifier(bareBill()), "S. 5213");
  assert.equal(
    billIdentifier(bareBill({ bill_type_label: "H.R.", bill_number: "9237" })),
    "H.R. 9237",
  );
});

it("the article agrees with every real policy area", () => {
  for (const area of POLICY_AREAS) {
    const bill = bareBill({ bill_subjects: { policy_area_name: area } });
    const expected = /^[AEIOU]/.test(area) ? `is an ${area} bill` : `is a ${area} bill`;
    for (const prose of [billSeoDescription(bill), billAnswerParagraph(bill)]) {
      assert.ok(prose.includes(expected), `wrong article for "${area}": ${prose.slice(0, 80)}`);
    }
  }
});

it("every description stays inside the snippet budget across all stages", () => {
  for (const stage of [20, 40, 60, 80, 85, 90, 95, 100]) {
    for (const summary of [undefined, "<p>Directs the Secretary to establish a program.</p>"]) {
      const d = billSeoDescription(bareBill({ progress_stage: stage, latest_summary: summary }));
      assert.ok(d.length <= 158, `stage ${stage} produced ${d.length} chars`);
    }
  }
});

if (failures.length > 0) {
  console.error(`\nseo: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`seo: all ${passed} tests passed`);
