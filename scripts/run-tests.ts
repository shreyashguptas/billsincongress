/**
 * The test entry point — `pnpm test` runs this and nothing else.
 *
 * Test files are DISCOVERED, not listed. Every tracked (or untracked but not
 * ignored) `*.test.ts` runs, so a newly written test executes the moment it is
 * saved and there is no list to forget to update.
 *
 * That trade buys one new failure mode, and the floor below exists to catch it.
 * Discovery can come back empty for reasons that have nothing to do with the
 * tests: git missing from PATH, a checkout without a .git directory, a pathspec
 * that stops matching. Iterating over an empty list succeeds, so the suite then
 * reports success having executed nothing at all. A green result that proved
 * nothing is worse than a red one, because it is trusted.
 *
 * MIN_TEST_FILES only ever trips when the count FALLS, so adding tests needs no
 * change here. Deleting one is meant to be deliberate: drop the number in the
 * same commit and the reviewer sees the intent.
 */
import { execFileSync, spawnSync } from "node:child_process";

/** Lower only when deliberately deleting a test. Adding one needs no change. */
const MIN_TEST_FILES = 25;

/** Guards that assert repo-wide invariants rather than testing one module. */
const GUARDS = [
  "scripts/check-no-userid-args.ts",
  "scripts/check-metered-model-calls.ts",
];

function discoverTestFiles(): string[] {
  let stdout: string;
  try {
    stdout = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "*.test.ts"],
      { encoding: "utf8" },
    );
  } catch (error) {
    // Never fall back to "found nothing" here. Being unable to ask the question
    // is the exact case this script exists to refuse to paper over.
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Could not list test files via git: ${reason}`);
    process.exit(1);
  }
  return stdout.split("\n").filter(Boolean).sort();
}

const testFiles = discoverTestFiles();

if (testFiles.length < MIN_TEST_FILES) {
  console.error(
    `Discovered ${testFiles.length} test file(s), expected at least ${MIN_TEST_FILES}.\n` +
      "Either discovery is broken (so nothing was actually verified), or a test\n" +
      "file was deleted — if deliberate, lower MIN_TEST_FILES in this file.",
  );
  process.exit(1);
}

/**
 * Exit code a test uses when it could not run for want of the production copy
 * in .truth-cache/. Kept in step with scripts/truth/fakedb.ts.
 *
 * These are counted and printed SEPARATELY, and deliberately not as passes. The
 * accuracy tests — the ones that drive the real handlers against real rows —
 * skipped silently in CI while this script printed "0 failed", so a green run
 * read as proof of exactly the thing it had not checked.
 */
const SKIPPED_NO_DATA = 3;

let failed = 0;
const skipped: string[] = [];
for (const file of [...testFiles, ...GUARDS]) {
  const result = spawnSync("tsx", [file], { stdio: "inherit" });
  if (result.status === SKIPPED_NO_DATA) {
    skipped.push(file);
  } else if (result.status !== 0) {
    failed += 1;
    console.error(`FAIL ${file}`);
  }
}

// Print what ran, so a passing run is evidence rather than an assertion. CI
// pastes this into the review, where "0 files" would otherwise read as success.
console.log(
  `\n${testFiles.length} test file(s) + ${GUARDS.length} guard(s) run, ${failed} failed` +
    (skipped.length > 0 ? `, ${skipped.length} SKIPPED.` : "."),
);
if (skipped.length > 0) {
  console.log(
    `\n${skipped.length} file(s) did NOT run — no .truth-cache/ production copy:\n` +
      skipped.map((f) => `  - ${f}`).join("\n") +
      `\n\nThese are the accuracy tests: they drive the real fetch handlers against a real\n` +
      `copy of production, and they are the only thing that checks the answer engine does\n` +
      `not state numbers it cannot defend. A green run WITHOUT them proves much less than\n` +
      `a green run with them. Before merging anything under convex/catalog, run:\n` +
      `  export $(grep -E '^CONVEX_DEPLOY_KEY=' <main-checkout>/.env | xargs)\n` +
      `  ./node_modules/.bin/tsx scripts/truth/dump.ts\n` +
      `  REQUIRE_TRUTH_CACHE=1 pnpm test\n` +
      `REQUIRE_TRUTH_CACHE=1 turns these skips into failures.`,
  );
}
process.exit(failed === 0 ? 0 : 1);
