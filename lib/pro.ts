/**
 * Pro plan copy and prices as shown to readers. What a reader is actually
 * charged is the Stripe Price the Checkout session uses (STRIPE_PRICE_PRO_*
 * in Convex env) — keep these two in step when either changes.
 */
export const PRO_PRICE_USD = { month: 9, year: 90 } as const;

export type ProInterval = keyof typeof PRO_PRICE_USD;

/** "$90 a year — two months free" style savings line for the yearly option. */
export function yearlySavingsMonths(): number {
  return Math.round(12 - PRO_PRICE_USD.year / PRO_PRICE_USD.month);
}
