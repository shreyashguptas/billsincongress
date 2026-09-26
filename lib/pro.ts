/**
 * Pro plan copy and prices as shown to readers. What a reader is actually
 * charged is the Stripe Price the Checkout session uses (STRIPE_PRICE_PRO_*
 * in Convex env) — keep these two in step when either changes.
 */
export const PRO_PRICE_USD = { month: 5, year: 50 } as const;

export type ProInterval = keyof typeof PRO_PRICE_USD;

/** "$50 a year — two months free" style savings line for the yearly option. */
export function yearlySavingsMonths(): number {
  return Math.round(12 - PRO_PRICE_USD.year / PRO_PRICE_USD.month);
}

/** The subset of `api.billing.status` the plan card reads. */
export interface PlanCardInput {
  plan: "free" | "pro";
  subscriptionStatus: string | null;
  interval: ProInterval | null;
  currentPeriodEnd: number | null; // unix seconds
  cancelAtPeriodEnd: boolean;
  hasBillingAccount: boolean;
}

export interface PlanCardView {
  label: "Pro" | "Free";
  cadence: "monthly" | "yearly" | null;
  /** One short line under the plan name; `warning` renders it as an alert. */
  message: string;
  tone: "normal" | "warning";
  /** "Manage billing" (Stripe portal). */
  showManage: boolean;
  /** The link to /pro, and what it says; null hides it. */
  subscribe: "See Pro" | "Subscribe again" | null;
}

/**
 * What the account page's plan card says for every state a subscription can
 * be in. One function, so each state is decided (and tested, pro.test.ts) in
 * one place rather than spread through JSX conditions.
 *
 * `formatDate` is passed in so the page and the tests share this logic but
 * not a locale.
 */
export function planCardView(
  b: PlanCardInput,
  opts: { checkoutReturned: boolean; waitedLong: boolean; formatDate: (unix: number) => string },
): PlanCardView {
  const isPro = b.plan === "pro";
  const cadence = isPro && b.interval ? (b.interval === "year" ? "yearly" : "monthly") : null;
  const on = b.currentPeriodEnd !== null ? opts.formatDate(b.currentPeriodEnd) : null;
  const view = (
    message: string,
    tone: PlanCardView["tone"] = "normal",
    subscribe: PlanCardView["subscribe"] = isPro ? null : "See Pro",
  ): PlanCardView => ({
    label: isPro ? "Pro" : "Free",
    cadence,
    message,
    tone,
    showManage: isPro || b.hasBillingAccount,
    subscribe,
  });

  if (isPro) {
    if (b.subscriptionStatus === "past_due") {
      return view(
        "Your last payment didn't go through. You keep Pro while Stripe retries; update your card under Manage billing to keep it.",
        "warning",
      );
    }
    if (b.cancelAtPeriodEnd) {
      return view(
        on
          ? `Cancelled. You keep Pro until ${on} and won't be charged again. To stay on Pro, renew under Manage billing.`
          : "Cancelled. You keep Pro until the end of the period you paid for and won't be charged again.",
      );
    }
    return view(on ? `Renews ${on}.` : "Active.");
  }

  // Back from Stripe with the webhook not yet recorded. The plan updates live
  // when it lands; if it has not after a minute, something is wrong.
  if (opts.checkoutReturned) {
    return opts.waitedLong
      ? view(
          "This is taking longer than usual. If you were charged and this page still says Free in a few minutes, email hi@billsincongress.com and we'll sort it out.",
          "warning",
          null,
        )
      : view("Payment received — confirming with Stripe. This page updates on its own in a few seconds.", "normal", null);
  }

  switch (b.subscriptionStatus) {
    case "canceled":
      return view(
        "Your Pro plan has ended. The bills you follow are still saved; subscribe again to resume their alerts.",
        "normal",
        "Subscribe again",
      );
    case "unpaid":
      return view(
        "Pro stopped because a payment didn't go through. Update your card under Manage billing to restore it.",
        "warning",
        null,
      );
    case "paused":
      return view("Pro is paused. Resume it under Manage billing.", "normal", null);
    case "incomplete":
      return view(
        "Your first payment is still being confirmed. If it doesn't go through, Stripe cancels it within a day and you won't be charged.",
        "normal",
        null,
      );
    case "incomplete_expired":
      return view(
        "Your last checkout didn't finish, so Pro didn't start and you weren't charged. You can try again.",
        "normal",
        "Subscribe again",
      );
    default:
      return view(
        "Reading the site is free. Pro emails you when bills you follow move and raises your daily questions.",
      );
  }
}

/**
 * The error code a failed billing action carries, for copy and analytics.
 * Our own refusals are ConvexError strings ("ALREADY_PRO"); the rate limiter's
 * is an object ({ kind: "RateLimited", ... }), which String() would turn into
 * "[object Object]".
 */
export function billingErrorCode(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && (data as { kind?: unknown }).kind === "RateLimited") {
    return "RATE_LIMITED";
  }
  return "UNKNOWN";
}
