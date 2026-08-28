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
const MIN_TEST_FILES = 24;

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

let failed = 0;
for (const file of [...testFiles, ...GUARDS]) {
  const result = spawnSync("tsx", [file], { stdio: "inherit" });
  if (result.status !== 0) {
    failed += 1;
    console.error(`FAIL ${file}`);
  }
}

// Print what ran, so a passing run is evidence rather than an assertion. CI
// pastes this into the review, where "0 files" would otherwise read as success.
console.log(
  `\n${testFiles.length} test file(s) + ${GUARDS.length} guard(s) run, ${failed} failed.`,
);
process.exit(failed === 0 ? 0 : 1);
