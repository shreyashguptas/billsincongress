/**
 * Spec §4.8 Rule 1, enforced statically.
 *
 * No PUBLIC Convex function may accept a userId argument — that would let any
 * caller pass someone else's. Identity must come from getAuthUserId(ctx).
 *
 * internalQuery / internalMutation / internalAction are exempt: they are not
 * reachable from a browser and are called by server code that already resolved
 * identity.
 *
 * Run with: `pnpm test`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "convex";
const offenders: string[] = [];

function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "_generated") walk(path);
      continue;
    }
    if (!path.endsWith(".ts") || path.endsWith(".test.ts")) continue;

    const source = readFileSync(path, "utf8");
    // Split on registrations so each function body is inspected in isolation.
    // The captured kind tells us whether it is public; `internal*` variants are
    // matched first by the alternation order so they are never mistaken for
    // their public counterparts.
    const parts = source.split(
      /\b(internalQuery|internalMutation|internalAction|query|mutation|action)\s*\(\s*\{/,
    );
    for (let i = 1; i < parts.length; i += 2) {
      const kind = parts[i];
      if (kind.startsWith("internal")) continue;
      const body = parts[i + 1] ?? "";
      const handlerAt = body.indexOf("handler");
      const args = handlerAt === -1 ? body : body.slice(0, handlerAt);
      if (/\buserId\s*:\s*v\./.test(args)) {
        offenders.push(`${path}: public ${kind} declares a userId argument`);
      }
    }
  }
}

walk(ROOT);

if (offenders.length > 0) {
  console.error("\ncheck-no-userid-args: FAILED (spec §4.8 Rule 1)\n");
  for (const o of offenders) console.error(`  ✗ ${o}`);
  console.error("\nIdentity must come from getAuthUserId(ctx), never from the caller.\n");
  process.exit(1);
}
console.log("check-no-userid-args: no public function takes a userId argument");
