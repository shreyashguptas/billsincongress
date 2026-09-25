/**
 * What the Pro plan is, in one place. Pure — no Convex imports — so the rules
 * can be unit-tested and read without the billing plumbing around them.
 *
 * `users.plan` is the single field every gate reads. Only the Stripe webhook
 * (convex/billing.ts) writes it, from the subscription status below; nothing a
 * client sends can set it.
 */

/** Daily question allowances. Shown to readers, so the UI reads these too. */
export const ANONYMOUS_CHAT_DAILY_LIMIT = 5;
export const AUTHED_CHAT_DAILY_LIMIT = 100;
/**
 * Five times the free signed-in allowance. The ceiling is a spend cap, not a
 * product feature: one question can make up to five model calls, so this bounds
 * the worst month a single subscriber can cost.
 */
export const PRO_CHAT_DAILY_LIMIT = 500;

/** Bills one subscriber can follow by email. Keeps the digest query bounded. */
export const MAX_ALERTS_PER_USER = 100;

export type Plan = "free" | "pro";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

/**
 * Which plan a Stripe subscription status grants.
 *
 * `past_due` keeps Pro on purpose: Stripe is still retrying the card, and
 * cutting a paying reader off on the first failed charge punishes an expired
 * card, not a cancellation. When the retries run out Stripe moves the
 * subscription to `unpaid` or `canceled`, and that ends Pro.
 */
export function planForStatus(status: string | undefined): Plan {
  return status === "active" || status === "trialing" || status === "past_due"
    ? "pro"
    : "free";
}

const KNOWN_STATUSES = new Set<string>([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

/** Narrows Stripe's status string to the schema's union; unknown → undefined. */
export function toSubscriptionStatus(
  status: string,
): SubscriptionStatus | undefined {
  return KNOWN_STATUSES.has(status) ? (status as SubscriptionStatus) : undefined;
}

/** Treats a missing plan as free — @convex-dev/auth inserts users without one. */
export function isPro(user: { plan?: Plan } | null | undefined): boolean {
  return user?.plan === "pro";
}

export function chatDailyLimitFor(
  user: { plan?: Plan } | null | undefined,
): number {
  if (!user) return ANONYMOUS_CHAT_DAILY_LIMIT;
  return isPro(user) ? PRO_CHAT_DAILY_LIMIT : AUTHED_CHAT_DAILY_LIMIT;
}

/** The subset of a Stripe Subscription the webhook reads. */
export interface StripeSubscriptionLike {
  id: string;
  status: string;
  customer: string | { id: string };
  metadata: Record<string, string> | null;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  items: { data: Array<{ price: { id: string }; current_period_end: number }> };
}

/**
 * What `applySubscription` should record for a subscription, or null when the
 * subscription is not this site's (another product on the same Stripe
 * account) or has a status we do not recognise.
 *
 * `current_period_end` is read from the item: since Stripe API 2025-03 it is no
 * longer on the subscription itself. "Ends at period end" is true for either
 * spelling Stripe uses — the portal sets `cancel_at`, the API flag sets both.
 */
export function subscriptionUpdate(sub: StripeSubscriptionLike, appTag: string) {
  if (sub.metadata?.app !== appTag) return null;
  const status = toSubscriptionStatus(sub.status);
  if (!status) return null;
  const item = sub.items.data[0];
  return {
    userId: sub.metadata.userId,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    status,
    priceId: item?.price.id,
    currentPeriodEnd: item?.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
  };
}

/** What a subscription looked like before and after one webhook applied it. */
export interface BillingState {
  plan?: Plan;
  status?: SubscriptionStatus;
  cancelAtPeriodEnd?: boolean;
  subscriptionId?: string;
}

export type BillingNotice =
  /** Pro just started. `returning` when the reader had an earlier subscription. */
  | { kind: "welcome"; returning: boolean }
  /** The reader cancelled; Pro runs to the end of the paid period. */
  | { kind: "cancel_scheduled" }
  /** The reader undid a scheduled cancellation. */
  | { kind: "cancel_withdrawn" }
  /** A renewal failed; Stripe is retrying and the reader keeps Pro meanwhile. */
  | { kind: "payment_failed" }
  /** Pro is over. */
  | { kind: "ended"; reason: "canceled" | "payment_failed" | "paused" };

/**
 * Which email, if any, a change in a reader's subscription deserves. Computed
 * from the stored row before and after `applySubscription`, so a redelivered
 * or out-of-order webhook that changes nothing sends nothing, and each real
 * change is announced once.
 *
 * Receipts, refunds and card-expiry notices are Stripe's to send (turned on in
 * its dashboard); these are the plan changes Stripe does not announce.
 */
export function billingNotice(before: BillingState, after: BillingState): BillingNotice | null {
  const wasPro = before.plan === "pro";
  const isPro = planForStatus(after.status) === "pro";

  if (!wasPro && isPro) {
    return {
      kind: "welcome",
      returning:
        before.subscriptionId !== undefined && before.subscriptionId !== after.subscriptionId,
    };
  }
  if (wasPro && !isPro) {
    if (after.status === "paused") return { kind: "ended", reason: "paused" };
    if (after.status === "unpaid" || before.status === "past_due") {
      return { kind: "ended", reason: "payment_failed" };
    }
    return { kind: "ended", reason: "canceled" };
  }
  if (wasPro && isPro) {
    if (after.status === "past_due" && before.status !== "past_due") return { kind: "payment_failed" };
    if (after.cancelAtPeriodEnd && !before.cancelAtPeriodEnd) return { kind: "cancel_scheduled" };
    if (!after.cancelAtPeriodEnd && before.cancelAtPeriodEnd) return { kind: "cancel_withdrawn" };
  }
  // A first payment that never went through (incomplete → incomplete_expired)
  // happened in front of the reader on Stripe's page; no email.
  return null;
}
