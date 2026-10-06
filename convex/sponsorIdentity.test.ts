/**
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { recaseFromFullName, sponsorFields } from "./sponsorIdentity";

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

// The 117th stores 59 members in capitals; the official full name is mixed case.
it("re-cases a name in capitals from the official full name", () => {
  assert.equal(recaseFromFullName("DELAURO", "Rep. DeLauro, Rosa L. [D-CT-3]"), "DeLauro");
  assert.equal(recaseFromFullName("ROSA", "Rep. DeLauro, Rosa L. [D-CT-3]"), "Rosa");
  assert.equal(recaseFromFullName("JACKSON LEE", "Rep. Jackson Lee, Sheila [D-TX-18]"), "Jackson Lee");
  assert.equal(recaseFromFullName("MCGOVERN", "Rep. McGovern, James P. [D-MA-2]"), "McGovern");
});

it("restores accents the capitals dropped", () => {
  assert.equal(recaseFromFullName("VELAZQUEZ", "Rep. Velázquez, Nydia M. [D-NY-7]"), "Velázquez");
});

it("leaves a mixed-case name alone, even when the full name differs", () => {
  // "Jacklyn" is how some of her bills spell her; it is not ours to rewrite.
  assert.equal(recaseFromFullName("Jacklyn", "Sen. Rosen, Jacky [D-NV]"), "Jacklyn");
  assert.equal(recaseFromFullName("Bob", "Sen. Casey, Robert P., Jr. [D-PA]"), "Bob");
});

it("never guesses a casing the full name does not contain", () => {
  assert.equal(recaseFromFullName("MCCARTHY", "Rep. Somebody, Else [R-CA-20]"), "MCCARTHY");
  assert.equal(recaseFromFullName("SMITH", undefined), "SMITH");
});

it("keeps the bioguide id and drops an empty one", () => {
  const s = sponsorFields({
    bioguideId: "D000216",
    firstName: "ROSA",
    lastName: "DELAURO",
    fullName: "Rep. DeLauro, Rosa L. [D-CT-3]",
    party: "D",
    state: "CT",
  });
  assert.deepEqual(s, {
    sponsorFirstName: "Rosa",
    sponsorLastName: "DeLauro",
    sponsorParty: "D",
    sponsorState: "CT",
    sponsorBioguideId: "D000216",
  });
  assert.equal(sponsorFields({ bioguideId: "", firstName: "A" }).sponsorBioguideId, undefined);
  assert.deepEqual(sponsorFields(undefined), {});
});

console.log(`\nsponsorIdentity: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
