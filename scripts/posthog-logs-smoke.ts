/**
 * Send ONE test line to PostHog Logs, built by the same code Convex uses
 * (`otlpLogBody` in convex/posthogLogs.ts), and print what PostHog answered.
 *
 * This is the check that PostHog accepts our format and token before
 * `POSTHOG_KEY` is set in Convex. The answer path itself cannot run
 * locally (this project has no Convex dev deployment), so this is the only
 * real-network proof short of a deploy.
 *
 *   POSTHOG_KEY=phc_… ./node_modules/.bin/tsx scripts/posthog-logs-smoke.ts
 *
 * Optional: POSTHOG_SESSION_ID=<a session id from PostHog> to check that the
 * line links to that session's replay. The line says "posthog logs smoke test"
 * and carries `test: true`, so it is easy to find and to ignore.
 */
import { otlpLogBody } from "../convex/posthogLogs";

const token = process.env.POSTHOG_KEY;
if (!token) {
  console.error("Set POSTHOG_KEY to the project's phc_… key.");
  process.exit(1);
}
const host = (process.env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/+$/, "");
const sessionId = process.env.POSTHOG_SESSION_ID;

async function main() {
  const response = await fetch(`${host}/i/v1/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(
      otlpLogBody({
        level: "info",
        message: "posthog logs smoke test",
        timestampMs: Date.now(),
        attributes: { test: true, ...(sessionId ? { sessionId } : {}) },
      }),
    ),
  });
  console.log(`PostHog answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  if (!response.ok) process.exit(1);
  console.log(
    "Now open PostHog → Logs, filter service billsincongress-convex, and look for the line.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
