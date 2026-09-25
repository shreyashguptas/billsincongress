/**
 * Delivery of bill alert emails. Sign-in codes do not come through here: they
 * are sent inline from the sign-in request (convex/emailCodes.ts) so a reader
 * waiting on a code never waits behind a digest run.
 *
 * `sendDigestForUser` (alerts.ts) schedules `deliverAlert` from inside the same
 * transaction that marks the bills as reported. A scheduled function is only
 * created if that transaction commits, so a digest is never queued without the
 * bills being marked, and never marked without being queued.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { EmailSendError, sendEmail } from "./posthogEmail";

/** Attempts per digest, counting the first. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 10 * 60_000];

/**
 * Real readers get alert mail only on a deployment that opts in with
 * ALERT_EMAILS_LIVE=true, so a dev deployment holding a copy of production
 * users can never email them. Everywhere else the send is logged and skipped.
 */
export function alertEmailsLive(): boolean {
  return process.env.ALERT_EMAILS_LIVE === "true";
}

export const deliverAlert = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { attempt = 1, ...email } = args;
    if (!alertEmailsLive()) {
      console.log(`[alert emails off] would send "${email.subject}"`);
      return { sent: false as const, reason: "not_live" as const };
    }
    try {
      await sendEmail("alerts", email);
      return { sent: true as const };
    } catch (err) {
      // Retry only what a retry can fix (PostHog down or rate-limiting). A
      // timeout after PostHog accepted the request could, in principle, mean a
      // reader gets the same digest twice; that is preferred over dropping it.
      const retryable = err instanceof EmailSendError && err.retryable;
      if (retryable && attempt < MAX_ATTEMPTS) {
        await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempt - 1], internal.email.deliverAlert, {
          ...email,
          attempt: attempt + 1,
        });
        return { sent: false as const, reason: "retrying" as const };
      }
      throw err;
    }
  },
});
