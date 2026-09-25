/**
 * Delivery of the emails that are queued rather than sent inline: bill-alert
 * digests (alerts.ts) and Pro plan-change notices (billing.ts). Sign-in codes
 * do not come through here: they are sent from the sign-in request itself
 * (convex/emailCodes.ts) so a reader waiting on a code never waits behind a
 * queue.
 *
 * The mutation that decides an email is due schedules `deliver` in the same
 * transaction that records it (the digest watermark, the new plan). A
 * scheduled function exists only if that transaction commits, so an email is
 * never queued for a change that did not happen, and never skipped for one
 * that did.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { EmailSendError, sendEmail } from "./posthogEmail";

/** Attempts per email, counting the first. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 10 * 60_000];

/**
 * Real readers get alert mail only on a deployment that opts in with
 * ALERT_EMAILS_LIVE=true, so a dev deployment holding a copy of production
 * users can never email them. Everywhere else the send is logged and skipped.
 *
 * Billing notices are not gated: they fire only on a real Stripe event for
 * that deployment's own Stripe account, so they reach whoever just paid.
 */
export function alertEmailsLive(): boolean {
  return process.env.ALERT_EMAILS_LIVE === "true";
}

export const deliver = internalAction({
  args: {
    stream: v.union(v.literal("alerts"), v.literal("billing")),
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { attempt = 1, stream, ...email } = args;
    if (stream === "alerts" && !alertEmailsLive()) {
      console.log(`[alert emails off] would send "${email.subject}"`);
      return { sent: false as const, reason: "not_live" as const };
    }
    try {
      await sendEmail(stream, email);
      return { sent: true as const };
    } catch (err) {
      // Retry only what a retry can fix (PostHog down or rate-limiting). A
      // timeout after PostHog accepted the request could, in principle, send
      // the same email twice; that is preferred over dropping it.
      const retryable = err instanceof EmailSendError && err.retryable;
      if (retryable && attempt < MAX_ATTEMPTS) {
        await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempt - 1], internal.email.deliver, {
          ...args,
          attempt: attempt + 1,
        });
        return { sent: false as const, reason: "retrying" as const };
      }
      throw err;
    }
  },
});
