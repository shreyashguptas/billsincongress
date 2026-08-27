/**
 * Every publicly-reachable path to the model must be metered.
 *
 * The daily cap is the only thing standing between an open Convex deployment
 * URL and unbounded OpenRouter spend. It is easy to add a second entry point
 * and forget it — that is exactly what happened with `answer.ts`'s `ask`, which
 * shipped as a public `action` with no auth and no limiter while all the
 * protection lived in `stream` beside it.
 *
 * The rule: in any convex module that reads OPENROUTER_API_KEY, every PUBLIC
 * `action` or `httpAction` must call `rateLimiter.limit`. Internal functions are
 * exempt — they are not reachable from a browser. Queries and mutations are out
 * of scope because Convex forbids network I/O in them, so they cannot reach the
 * model at all.
 *
 * Run with: `pnpm test`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "convex";
const offenders: string[] = [];

/**
 * Only a top-level registration counts: `export const foo = action({`.
 *
 * Matching a bare `action(` or `query(` instead would also hit `ctx.db.query(`
 * and `ctx.runQuery(`, which is how the first version of this check produced
 * six false positives in llm.ts. The `export const NAME =` prefix is what makes
 * a bare `\(` safe here.
 *
 * Do NOT require `({` after the call: `httpAction(async (ctx, req) => {` is the
 * other spelling, and missing it means the PRECEDING function's body silently
 * runs to end-of-file and inherits its neighbour's rate limiter.
 */
const REGISTRATION =
  /export\s+const\s+(\w+)\s*=\s*(internalAction|httpAction|action)\s*\(/g;

function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "_generated") walk(path);
      continue;
    }
    if (!path.endsWith(".ts") || path.endsWith(".test.ts")) continue;

    const source = readFileSync(path, "utf8");
    if (!source.includes("OPENROUTER_API_KEY")) continue;

    // Judge each function on ITS OWN body, bounded by the next registration. A
    // whole-file grep is not enough: answer.ts holds a metered `stream` right
    // beside what used to be an unmetered `ask`, and a file-level check passes
    // that happily.
    const marks = [...source.matchAll(REGISTRATION)];
    for (let i = 0; i < marks.length; i++) {
      const [, name, kind] = marks[i];
      if (kind.startsWith("internal")) continue;
      const start = marks[i].index ?? 0;
      const end = i + 1 < marks.length ? (marks[i + 1].index ?? source.length) : source.length;
      if (!source.slice(start, end).includes("rateLimiter.limit")) {
        offenders.push(
          `${path}: public ${kind} \`${name}\` reaches OpenRouter but never calls rateLimiter.limit`,
        );
      }
    }
  }
}

walk(ROOT);

if (offenders.length > 0) {
  console.error("\ncheck-metered-model-calls: FAILED\n");
  for (const o of offenders) console.error(`  ✗ ${o}`);
  console.error(
    "\nA public path to the model with no daily cap is unbounded spend for anyone\n" +
      "who knows the deployment URL. Make it internal, or meter it.\n",
  );
  process.exit(1);
}
console.log("check-metered-model-calls: every public path to the model is metered");
