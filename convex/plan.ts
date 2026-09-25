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
