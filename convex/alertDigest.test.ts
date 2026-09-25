/**
 * Unit tests for the bill-alert "what is new" rule and the digest email.
 * node:assert, no framework, same shape as syncStatus.test.ts. Run via `pnpm test`.
 *
 * Each case is a wrong email a reader could otherwise get: an action reported
 * twice, an action never reported, a duplicate floor action listed twice, or a
 * bill title that breaks the HTML.
 */
import assert from "node:assert/strict";
import {
  digestSubject,
  fingerprintAction,
  formatActionDate,
  hasNews,
  MAX_ACTIONS_PER_BILL,
  MAX_BILLS_IN_FULL,
  MAX_DIGEST_HTML_BYTES,
  newActionsSince,
  renderDigestEmail,
  watermarkFor,
  type ActionRow,
  type BillChange,
} from "./alertDigest";

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

const introduced: ActionRow = { actionDate: "2026-09-01", text: "Introduced in House" };
const referred: ActionRow = {
  actionDate: "2026-09-01",
  text: "Referred to the Committee on Energy and Commerce.",
};
const reported: ActionRow = { actionDate: "2026-09-20", text: "Ordered to be Reported." };
const passedHouse: ActionRow = {
  actionDate: "2026-09-23",
  text: "On passage Passed by recorded vote: 301 - 120 (Roll no. 412).",
};

it("a new alert reports nothing that already happened", () => {
  const actions = [introduced, referred, reported];
  const wm = watermarkFor(actions, 40);
  assert.deepEqual(newActionsSince(actions, wm), []);
  assert.equal(wm.lastSeenActionDate, "2026-09-20");
  assert.equal(wm.lastSeenStage, 40);
});

it("reports an action dated after the watermark", () => {
  const wm = watermarkFor([introduced, referred, reported], 40);
  const fresh = newActionsSince([introduced, referred, reported, passedHouse], wm);
  assert.deepEqual(fresh, [passedHouse]);
});

it("reports a second action posted later for the SAME day as the watermark", () => {
  // Congress.gov posted one Sep 20 action, we emailed, then the next sync added
  // another Sep 20 action. A date-only watermark would never report it.
  const wm = watermarkFor([introduced, reported], 40);
  const lateSameDay: ActionRow = { actionDate: "2026-09-20", text: "Reported by the Committee." };
  assert.deepEqual(newActionsSince([introduced, reported, lateSameDay], wm), [lateSameDay]);
});

it("does not re-report an action whose text was only re-spaced by a re-sync", () => {
  const wm = watermarkFor([reported], 40);
  const respaced: ActionRow = { actionDate: "2026-09-20", text: "Ordered  to be\nReported. " };
  assert.deepEqual(newActionsSince([respaced], wm), []);
});

it("lists a duplicated floor action once (House clerk + Library of Congress)", () => {
  const wm = watermarkFor([reported], 40);
  const fresh = newActionsSince([reported, passedHouse, { ...passedHouse }], wm);
  assert.equal(fresh.length, 1);
});

it("returns new actions oldest first even when stored newest first", () => {
  const wm = watermarkFor([introduced], 20);
  const fresh = newActionsSince([passedHouse, reported, introduced], wm);
  assert.deepEqual(fresh.map((a) => a.actionDate), ["2026-09-20", "2026-09-23"]);
});

it("a bill with no actions yet reports its first action", () => {
  const wm = watermarkFor([], undefined);
  assert.equal(wm.lastSeenActionDate, undefined);
  assert.deepEqual(newActionsSince([introduced], wm), [introduced]);
});

it("fingerprints are stable and date-sensitive", () => {
  assert.equal(fingerprintAction(reported), fingerprintAction({ ...reported }));
  assert.notEqual(fingerprintAction(reported), fingerprintAction({ ...reported, actionDate: "2026-09-21" }));
});

function change(overrides: Partial<BillChange> = {}): BillChange {
  return {
    billId: "1234hr119",
    billTypeLabel: "H.R.",
    billNumber: "1234",
    congress: 119,
    title: "Clean Water Act Amendments",
    newActions: [passedHouse],
    ...overrides,
  };
}

it("a status change alone is news; no action and no status change is not", () => {
  assert.equal(hasNews(change({ newActions: [], stageChange: { from: 40, to: 60 } })), true);
  assert.equal(hasNews(change({ newActions: [] })), false);
});

it("subject leads with the status change", () => {
  assert.equal(
    digestSubject([change({ stageChange: { from: 40, to: 60 } })]),
    "H.R. 1234 passed one chamber",
  );
  assert.equal(digestSubject([change()]), "New action on H.R. 1234");
  assert.equal(
    digestSubject([
      change(),
      change({ billId: "56s119", billTypeLabel: "S.", billNumber: "56", stageChange: { to: 100 } }),
      change({ billId: "9hr119", billNumber: "9" }),
    ]),
    "S. 56 became law, and 2 more bills you follow",
  );
});

const links = {
  siteUrl: "https://billsincongress.com",
  manageUrl: "https://billsincongress.com/account#alerts",
  unsubscribeUrl: "https://billsincongress.com/alerts/unsubscribe?token=abc",
};

it("escapes bill titles and action text in the HTML", () => {
  const email = renderDigestEmail(
    [change({ title: `To amend <script>alert("x")</script> & more`, newActions: [{ actionDate: "2026-09-23", text: "A <b>bold</b> move" }] })],
    links,
    new Date("2026-09-24T11:00:00Z"),
  );
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.html.includes("&lt;script&gt;"));
  assert.ok(email.html.includes("A &lt;b&gt;bold&lt;/b&gt; move"));
  // The plain-text part is not HTML and must not be escaped.
  assert.ok(email.text.includes(`To amend <script>alert("x")</script> & more`));
});

it("links to the bill page and carries both unsubscribe routes", () => {
  const email = renderDigestEmail([change()], links, new Date("2026-09-24T11:00:00Z"));
  assert.ok(email.html.includes("https://billsincongress.com/bills/1234hr119"));
  assert.ok(email.html.includes(links.unsubscribeUrl));
  assert.ok(email.text.includes(links.unsubscribeUrl));
  assert.ok(email.text.includes(links.manageUrl));
});

it("reads the same with remote content blocked (Apple Mail Privacy Protection)", () => {
  const email = renderDigestEmail([change()], links, new Date("2026-09-24T11:00:00Z"));
  // Nothing a blocker could strip: no images, web fonts, or remote CSS.
  for (const remote of ["<img", "<link", "@import", "@font-face", "url(", "background-image"]) {
    assert.ok(!email.html.toLowerCase().includes(remote), remote);
  }
});

it("sends PostHog the email without a second document shell", () => {
  const email = renderDigestEmail([change()], links, new Date("2026-09-24T11:00:00Z"));
  assert.ok(!/<(!doctype|html|head|body)\b/i.test(email.bodyHtml));
  assert.ok(email.html.includes(email.bodyHtml));
  assert.ok(email.bodyHtml.includes("https://billsincongress.com/bills/1234hr119"));
  assert.ok(email.bodyHtml.includes(links.unsubscribeUrl));
});

it("a heavy day (100 bills, 10 actions each) stays under the size Gmail clips, and lists every bill", () => {
  const long = "A bill to amend the Internal Revenue Code of 1986 to provide for a credit against tax for certain expenses, and for other purposes";
  const many = Array.from({ length: 100 }, (_, i) =>
    change({
      billId: `${2000 + i}hr119`,
      billNumber: String(2000 + i),
      title: long,
      newActions: Array.from({ length: 10 }, (_, j) => ({ actionDate: "2026-09-25", text: `Referred to the Subcommittee on Health, Employment, Labor, and Pensions ${j}` })),
    }),
  );
  const email = renderDigestEmail(many, links, new Date("2026-09-25T11:00:00Z"));
  assert.ok(new TextEncoder().encode(email.bodyHtml).length <= MAX_DIGEST_HTML_BYTES, "over budget");
  for (const c of many) {
    assert.ok(email.bodyHtml.includes(`/bills/${c.billId}`), `html missing ${c.billId}`);
    assert.ok(email.text.includes(`/bills/${c.billId}`), `text missing ${c.billId}`);
  }
  // At most MAX_BILLS_IN_FULL bills show their action lines.
  const fullBills = (email.bodyHtml.match(/Referred to the Subcommittee on Health, Employment, Labor, and Pensions 9/g) ?? []).length;
  assert.ok(fullBills <= MAX_BILLS_IN_FULL, `${fullBills} in full`);
  assert.ok(email.bodyHtml.includes("Also moved (")); 
  assert.ok(email.bodyHtml.includes(links.unsubscribeUrl), "unsubscribe link must survive");
  assert.match(email.subject, /and 99 more bills you follow/);
});

it("even with very long official titles, 100 moving bills stay under the budget", () => {
  const huge = "To amend title XVIII of the Social Security Act to provide for coverage of certain services, ".repeat(6);
  const many = Array.from({ length: 100 }, (_, i) =>
    change({
      billId: `${3000 + i}hr119`,
      billNumber: String(3000 + i),
      title: huge,
      newActions: Array.from({ length: 10 }, (_, j) => ({ actionDate: "2026-09-25", text: `${huge.slice(0, 200)} ${j}` })),
    }),
  );
  const email = renderDigestEmail(many, links, new Date("2026-09-25T11:00:00Z"));
  assert.ok(new TextEncoder().encode(email.bodyHtml).length <= MAX_DIGEST_HTML_BYTES, "over budget");
  for (const c of many) assert.ok(email.bodyHtml.includes(`/bills/${c.billId}`), c.billId);
  assert.ok(email.bodyHtml.includes(links.unsubscribeUrl));
});

it("the summary counts every bill that became law, not just whether one did", () => {
  const email = renderDigestEmail(
    [
      change({ billId: "56s119", billTypeLabel: "S.", billNumber: "56", stageChange: { from: 95, to: 100 } }),
      change({ billId: "57s119", billTypeLabel: "S.", billNumber: "57", stageChange: { from: 95, to: 100 } }),
      change({ billId: "9hr119", billNumber: "9", stageChange: { from: 40, to: 60 } }),
    ],
    links,
    new Date("2026-09-25T11:00:00Z"),
  );
  assert.match(email.bodyHtml, /moved, 2 to law/);
  assert.doesNotMatch(email.bodyHtml, /moved, 1 to law/);
});

it("a normal day has no compact section", () => {
  const email = renderDigestEmail([change(), change({ billId: "5hr119", billNumber: "5" })], links, new Date("2026-09-25T11:00:00Z"));
  assert.ok(!email.bodyHtml.includes("Also moved"));
  assert.ok(!email.text.includes("Also moved"));
});

it("caps actions per bill and says how many more there are", () => {
  const many: ActionRow[] = Array.from({ length: MAX_ACTIONS_PER_BILL + 3 }, (_, i) => ({
    actionDate: `2026-09-${String(i + 1).padStart(2, "0")}`,
    text: `Action ${i + 1}`,
  }));
  const email = renderDigestEmail([change({ newActions: many })], links, new Date("2026-09-24T11:00:00Z"));
  assert.ok(email.text.includes("and 3 earlier new actions on the bill page"));
  // Newest first: the latest action is shown, the earliest is not.
  assert.ok(email.text.includes(`Action ${MAX_ACTIONS_PER_BILL + 3}`));
  assert.ok(!email.text.includes("  Sep 1, 2026  Action 1\n"));
});

it("formats action dates without a timezone shift", () => {
  assert.equal(formatActionDate("2026-01-01"), "Jan 1, 2026");
  assert.equal(formatActionDate("2026-09-23T00:00:00Z"), "Sep 23, 2026");
});

if (failures.length > 0) {
  console.error(`alertDigest: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`alertDigest: ${passed} passed`);
