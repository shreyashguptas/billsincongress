/**
 * Ask PRODUCTION a fixed set of factual questions and score every answer against
 * ground truth computed independently from the raw table dumps.
 *
 * THIS IS NOT PART OF `pnpm test`. It spends real model calls against the live
 * deployment and needs production credentials, so it is run deliberately —
 * before shipping a change to the fetch layer, the prompt or the tools — and
 * never on a hook. It is named check-answers.ts rather than *.test.ts precisely
 * so the suite's discovery cannot pick it up and start billing.
 *
 *   export $(grep -E '^CONVEX_DEPLOY_KEY=' <main-checkout>/.env | xargs)
 *   ./node_modules/.bin/tsx scripts/truth/check-answers.ts
 *   ./node_modules/.bin/tsx scripts/truth/check-answers.ts --only health-laws --runs 1
 *   ./node_modules/.bin/tsx scripts/truth/check-answers.ts --oracle-only   # free
 *
 * THREE OUTCOMES, AND ONLY ONE OF THEM IS A PASS.
 *   CORRECT     the answer asserts the true value.
 *   WRONG       it asserts something else. Exits non-zero.
 *   UNCHECKABLE no single claim could be pulled out of it: it hedged, it
 *               contradicted itself, it asked the reader a question, or it
 *               errored. NOT a pass. Counted and printed separately, because a
 *               system that "improves" by refusing to answer would otherwise
 *               show up as a clean scorecard, and the audit's whole lesson is
 *               that a confident answer and no answer are different failures.
 *
 * EVERY QUESTION IS ASKED THREE TIMES and the WORST run is the score. Several
 * defects were intermittent — the wrong-bill answer reproduced in 2 runs out of
 * 3 — so a single green run proves nothing. Runs that disagree are flagged
 * INTERMITTENT, which is itself a finding: a question that is right two times in
 * three is not fixed.
 */
import { execFileSync } from "node:child_process";
import { containsName, extractBillId, extractBoolean, extractNumber } from "./extract";
import type { Extraction } from "./extract";
import { CACHE_MISSING_MESSAGE, QUESTIONS, loadRawDb } from "./questions";
import type { Expected, RawDb, TruthQuestion } from "./questions";

const DEFAULT_RUNS = 3;
/** One ask runs a multi-round tool loop against a real model. */
const ASK_TIMEOUT_MS = 240_000;

const KEY_HELP =
  "CONVEX_DEPLOY_KEY is not set, so there is no deployment to ask.\n\n" +
  "  export $(grep -E '^CONVEX_DEPLOY_KEY=' <main-checkout>/.env | xargs)\n" +
  "  ./node_modules/.bin/tsx scripts/truth/check-answers.ts\n\n" +
  "The key selects the deployment on its own — do not also pass --prod. The point\n" +
  "of this harness is to score what readers actually get, so it must be pointed at\n" +
  "production and not at a dev deployment.";

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

export type Outcome = "CORRECT" | "UNCHECKABLE" | "WRONG";

/** Worst wins. A question is only as good as its worst run. */
const SEVERITY: Record<Outcome, number> = { CORRECT: 0, UNCHECKABLE: 1, WRONG: 2 };

export interface RunResult {
  outcome: Outcome;
  got: string;
  /**
   * What production actually said, flattened. Carried on every run that is not
   * CORRECT because `got` is only the extracted claim: a scorecard reading
   * `WRONG — false` cannot tell you whether production denied a true thing or
   * whether the extractor misread a correct answer, and those need opposite
   * fixes. Without the prose the only way to tell them apart is to re-ask by
   * hand, which costs another model call and may not reproduce.
   */
  said?: string;
}

export interface AskResult {
  text?: string;
  error?: string;
  askedReader?: boolean;
  truncatedByLength?: boolean;
}

// ---------------------------------------------------------------------------
// Talking to production
// ---------------------------------------------------------------------------

/**
 * `convex run` prints the returned value as pretty JSON after whatever the CLI
 * and the action logged. The result object is the only one whose opening brace
 * sits at column 0 (nested objects are indented), so scan up from the bottom for
 * a line starting with `{` that parses to the end of the output.
 */
export function parseAskOutput(stdout: string): AskResult | null {
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].startsWith("{")) continue;
    try {
      return JSON.parse(lines.slice(i).join("\n")) as AskResult;
    } catch {
      // A log line that merely begins with a brace. Keep looking upwards.
    }
  }
  return null;
}

function ask(question: TruthQuestion): AskResult {
  const args: Record<string, string> = { question: question.question };
  if (question.focusBillId) args.focusBillId = question.focusBillId;

  let stdout: string;
  try {
    stdout = execFileSync("npx", ["convex", "run", "answer:ask", JSON.stringify(args)], {
      encoding: "utf8",
      timeout: ASK_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `convex run failed: ${message.split("\n")[0]}` };
  }

  const parsed = parseAskOutput(stdout);
  if (!parsed) return { error: "could not find a JSON result in the convex run output" };
  return parsed;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreExtraction(expected: Expected, extraction: Extraction): RunResult {
  if (!extraction.found) return { outcome: "UNCHECKABLE", got: extraction.reason };

  if (expected.kind === "number") {
    if (typeof extraction.value !== "number") {
      return { outcome: "UNCHECKABLE", got: `not a number: ${String(extraction.value)}` };
    }
    const target = expected.value as number;
    const ok = Math.abs(extraction.value - target) <= (expected.tolerance ?? 0);
    return { outcome: ok ? "CORRECT" : "WRONG", got: String(extraction.value) };
  }

  const ok = extraction.value === expected.value;
  return { outcome: ok ? "CORRECT" : "WRONG", got: String(extraction.value) };
}

export function scoreRun(expected: Expected, result: AskResult): RunResult {
  if (result.error) return { outcome: "UNCHECKABLE", got: result.error };
  if (result.askedReader) {
    return {
      outcome: "UNCHECKABLE",
      got: "asked the reader a question instead of answering",
      said: flatten(result.text ?? ""),
    };
  }
  const text = (result.text ?? "").trim();
  if (text.length === 0) return { outcome: "UNCHECKABLE", got: "empty answer" };

  const scored = scoreText(expected, text);
  return scored.outcome === "CORRECT" ? scored : { ...scored, said: flatten(text) };
}

function scoreText(expected: Expected, text: string): RunResult {
  switch (expected.kind) {
    case "number":
      return scoreExtraction(expected, extractNumber(text));
    case "boolean":
      return scoreExtraction(expected, extractBoolean(text));
    case "billId": {
      // The congress is the last three digits of the id we are expecting, so a
      // question about the 118th is not scored against a 119th-shaped id.
      const id = expected.value as string;
      const congress = Number(id.slice(-3));
      return scoreExtraction(expected, extractBillId(text, congress));
    }
    case "name": {
      // Unlike the other kinds, a missing name scores WRONG rather than
      // UNCHECKABLE. "Which member has the fewest bills" has exactly one right
      // reply; an answer that names nobody has not refused carefully, it has
      // failed to answer, and the defect it hides (naming the wrong member) is
      // the one this harness was built for.
      //
      // KNOWN LIMIT, do not read this as safe: unlike extractNumber, which
      // refuses when two numbers survive, a substring match cannot see a SECOND
      // name. An answer that asserts "Tom McClintock has the fewest, ahead of
      // James Gallagher" contains the true name and scores CORRECT. The
      // one-name directive on every name question (questions.ts) is what keeps
      // that out of practice, not this function — checked live on 2026-08-31,
      // where production named McClintock alone and scored WRONG. If a future
      // answer style starts listing runners-up, this has to grow an
      // ambiguity refusal like extractNumber's.
      const name = expected.value as string;
      return containsName(text, name)
        ? { outcome: "CORRECT", got: name }
        : { outcome: "WRONG", got: `does not name ${name}` };
    }
  }
}

/** A question is only as good as its worst run. */
export function worstOutcome(runs: RunResult[]): Outcome {
  let outcome: Outcome = "CORRECT";
  for (const r of runs) if (SEVERITY[r.outcome] > SEVERITY[outcome]) outcome = r.outcome;
  return outcome;
}

function flatten(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 150 ? `${one.slice(0, 147)}...` : one;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Options {
  only: string[];
  runs: number;
  oracleOnly: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { only: [], runs: DEFAULT_RUNS, oracleOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--oracle-only") {
      options.oracleOnly = true;
    } else if (arg === "--only") {
      options.only.push(argv[++i]);
    } else if (arg === "--runs") {
      options.runs = Number(argv[++i]);
      if (!Number.isInteger(options.runs) || options.runs < 1) {
        throw new Error("--runs takes a positive integer");
      }
    } else {
      throw new Error(`Unknown argument '${arg}'. Use --only <id>, --runs <n>, --oracle-only.`);
    }
  }
  const ids = new Set(QUESTIONS.map((q) => q.id));
  for (const id of options.only) {
    if (!ids.has(id)) throw new Error(`No question '${id}'. Known: ${[...ids].join(", ")}`);
  }
  return options;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface Scored {
  question: TruthQuestion;
  expected: Expected;
  outcome: Outcome;
  runs: RunResult[];
  intermittent: boolean;
}

function report(scored: Scored[]): void {
  console.log("\n================ SCORECARD ================\n");
  for (const s of scored) {
    const flag = s.intermittent ? " (INTERMITTENT)" : "";
    console.log(`${s.outcome}${flag}  ${s.question.id}`);
    console.log(`  asked     ${flatten(s.question.question)}`);
    if (s.question.focusBillId) console.log(`  on bill   ${s.question.focusBillId}`);
    console.log(`  expected  ${String(s.expected.value)}  [${s.expected.kind}]`);
    s.runs.forEach((r, i) => {
      console.log(`  run ${i + 1}     ${r.outcome} — ${r.got}`);
      // The words production used, so a red line can be judged without paying
      // for another ask: "WRONG — false" alone does not say whether the answer
      // denied a true thing or whether the extractor misread it.
      if (r.said) console.log(`    said    ${r.said}`);
    });
    console.log(`  oracle    ${s.expected.note}`);
    console.log(`  defect    ${s.question.defect}`);
    console.log("");
  }

  const tally = (o: Outcome) => scored.filter((s) => s.outcome === o).length;
  const wrong = tally("WRONG");
  const uncheckable = tally("UNCHECKABLE");
  const correct = tally("CORRECT");
  console.log("===========================================");
  console.log(`${correct} correct · ${wrong} wrong · ${uncheckable} uncheckable`);
  if (uncheckable > 0) {
    console.log(
      `\n${uncheckable} question(s) could not be scored. That is NOT a pass: an answer ` +
        `nobody\ncan check is an answer nobody can trust. Read them above before ` +
        `calling this green.`,
    );
  }
  const intermittent = scored.filter((s) => s.intermittent).map((s) => s.question.id);
  if (intermittent.length > 0) {
    console.log(`\nIntermittent (runs disagreed): ${intermittent.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------

function main(): void {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    // A usage mistake gets one line, not a stack trace: this is a script people
    // reach for once a month and misremember the flags of.
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  let db: RawDb;
  try {
    db = loadRawDb();
  } catch (error) {
    console.error(error instanceof Error ? error.message : CACHE_MISSING_MESSAGE);
    process.exit(1);
  }

  const chosen =
    options.only.length > 0 ? QUESTIONS.filter((q) => options.only.includes(q.id)) : QUESTIONS;

  // The oracle runs first and for free. If it throws, the cache is stale or
  // wrong, and scoring production against a broken oracle would be worse than
  // not scoring it at all.
  const expectations = new Map<string, Expected>();
  for (const q of chosen) expectations.set(q.id, q.expect(db));

  if (options.oracleOnly) {
    console.log("Ground truth from .truth-cache/ (no model calls, nothing asked):\n");
    for (const q of chosen) {
      const e = expectations.get(q.id) as Expected;
      const band = e.tolerance ? ` ±${e.tolerance}` : "";
      console.log(`${q.id}\n  ${e.kind}: ${String(e.value)}${band}\n  ${e.note}\n`);
    }
    return;
  }

  if (!process.env.CONVEX_DEPLOY_KEY) {
    console.error(KEY_HELP);
    process.exit(1);
  }

  console.log(
    `Asking production ${chosen.length} question(s), ${options.runs}x each ` +
      `(${chosen.length * options.runs} model calls).`,
  );

  const scored: Scored[] = [];
  for (const q of chosen) {
    const expected = expectations.get(q.id) as Expected;
    const runs: RunResult[] = [];
    process.stdout.write(`  ${q.id} `);
    for (let i = 0; i < options.runs; i++) {
      const run = scoreRun(expected, ask(q));
      runs.push(run);
      process.stdout.write(run.outcome === "CORRECT" ? "." : run.outcome === "WRONG" ? "X" : "?");
    }
    process.stdout.write("\n");
    scored.push({
      question: q,
      expected,
      outcome: worstOutcome(runs),
      runs,
      intermittent: new Set(runs.map((r) => r.outcome)).size > 1,
    });
  }

  report(scored);

  const wrong = scored.filter((s) => s.outcome === "WRONG").length;
  if (wrong > 0) {
    console.error(`\n${wrong} question(s) answered WRONG.`);
    process.exit(1);
  }
  // A run in which nothing at all could be scored has not verified accuracy, it
  // has only failed to measure it. Passing on that would make the harness a
  // rubber stamp the first time the deployment stops answering.
  if (scored.every((s) => s.outcome !== "CORRECT")) {
    console.error("\nNot one question was scored CORRECT — this run verified nothing.");
    process.exit(1);
  }
}

// Only when this file IS the command. `pnpm test` discovers every *.test.ts in
// the repo, and check-answers.test.ts imports this module to test the scoring
// rules; with an unconditional main() that import would ask production every
// question in the set the moment someone ran the free, hermetic suite with a
// deploy key in their shell — which is exactly how the harness is run.
if ((process.argv[1] ?? "").endsWith("check-answers.ts")) main();
