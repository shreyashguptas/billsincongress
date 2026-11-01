/**
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { cosponsorRows, cosponsorsFingerprint } from "./cosponsors";

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`);
  }
}

// Shaped as Congress.gov returns them (Documentation/BillEndpoint.md, "Cosponsors Level").
const connolly = {
  bioguideId: "C001078",
  fullName: "Rep. Connolly, Gerald E. [D-VA-11]",
  firstName: "Gerald",
  middleName: "E.",
  lastName: "Connolly",
  party: "D",
  state: "VA",
  district: 11,
  sponsorshipDate: "2021-05-11",
  isOriginalCosponsor: true,
  url: "https://api.congress.gov/v3/member/C001078",
};

it("reads a cosponsor as Congress.gov lists one", () => {
  assert.deepEqual(cosponsorRows([connolly]), [
    {
      bioguideId: "C001078",
      firstName: "Gerald",
      lastName: "Connolly",
      party: "D",
      state: "VA",
      district: 11,
      sponsorshipDate: "2021-05-11",
      isOriginal: true,
    },
  ]);
});

it("re-cases names in capitals from the official full name, like the sponsor's", () => {
  const [row] = cosponsorRows([{ ...connolly, bioguideId: "D000216", firstName: "ROSA", lastName: "DELAURO", fullName: "Rep. DeLauro, Rosa L. [D-CT-3]" }]);
  assert.equal(row.firstName, "Rosa");
  assert.equal(row.lastName, "DeLauro");
});

it("keeps a withdrawn cosponsor with the date, listed last", () => {
  const rows = cosponsorRows([
    { ...connolly, bioguideId: "A000001", sponsorshipWithdrawnDate: "2021-06-01" },
    { ...connolly, bioguideId: "B000002", isOriginalCosponsor: false, sponsorshipDate: "2021-07-01" },
  ]);
  assert.deepEqual(rows.map((r) => [r.bioguideId, r.withdrawnDate]), [
    ["B000002", undefined],
    ["A000001", "2021-06-01"],
  ]);
});

it("lists original cosponsors first, then by the day they joined", () => {
  const rows = cosponsorRows([
    { ...connolly, bioguideId: "A000003", isOriginalCosponsor: false, sponsorshipDate: "2021-05-20" },
    { ...connolly, bioguideId: "A000002", isOriginalCosponsor: "True", sponsorshipDate: "2021-05-11", lastName: "Zed" },
    { ...connolly, bioguideId: "A000001", isOriginalCosponsor: true, sponsorshipDate: "2021-05-11", lastName: "Able" },
  ]);
  assert.deepEqual(rows.map((r) => r.bioguideId), ["A000001", "A000002", "A000003"]);
});

it("never keeps a cosponsor without a member id or a date", () => {
  assert.deepEqual(cosponsorRows([{ ...connolly, bioguideId: undefined }]), []);
  assert.deepEqual(cosponsorRows([{ ...connolly, bioguideId: "not-an-id" }]), []);
  assert.deepEqual(cosponsorRows([{ ...connolly, sponsorshipDate: "" }]), []);
  assert.deepEqual(cosponsorRows({ error: "rate limited" }), []);
});

it("keeps a member listed twice once", () => {
  assert.equal(cosponsorRows([connolly, connolly]).length, 1);
});

it("reads an at-large district and a senator's missing one", () => {
  assert.equal(cosponsorRows([{ ...connolly, district: 0 }])[0].district, 0);
  assert.equal(cosponsorRows([{ ...connolly, district: undefined }])[0].district, undefined);
  assert.equal(cosponsorRows([{ ...connolly, district: "4" }])[0].district, 4);
});

it("fingerprints the same set the same way whatever the order", () => {
  const a = cosponsorRows([connolly, { ...connolly, bioguideId: "A000001", isOriginalCosponsor: false, sponsorshipDate: "2021-06-01" }]);
  assert.equal(cosponsorsFingerprint(a), cosponsorsFingerprint([...a].reverse()));
  assert.notEqual(cosponsorsFingerprint(a), cosponsorsFingerprint(a.slice(1)));
});

console.log(`\ncosponsors: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
