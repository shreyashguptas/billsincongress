"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";

import { api } from "@/convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { billingErrorCode, planCardView } from "@/lib/pro";
import { formatCongressProse } from "@/lib/congress";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/brand/status";
import { SectionHeader } from "@/components/brand/section";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { billsService, type ChatUsageResult } from "@/lib/services/bills-service";
import { BillStageDescriptions } from "@/lib/utils/bill-stages";

/**
 * `listSaved` and `listMine` return a bill's stage as its description ("In
 * Committee"), the same string `getStageDescription` produces. Map it back to
 * the stage code so the row can carry a StatusPill; anything unrecognised
 * stays plain text.
 */
function stageFromDescription(description: string | null): number | null {
  if (!description) return null;
  const match = Object.entries(BillStageDescriptions).find(([, label]) => label === description);
  return match ? Number(match[0]) : null;
}

/** "Sep 3": the short date on saved and followed rows. */
function formatShortDate(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(ms));
}

export default function AccountPage() {
  const enabled = useConvexEnabled();
  if (!enabled) return <AccountSkeleton />;
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <React.Suspense fallback={<AccountSkeleton />}>
      <AccountInner />
    </React.Suspense>
  );
}

/** The page's shape while the account loads: the head and the three columns. */
function AccountSkeleton() {
  return (
    <div className="container-editorial">
      <p className="sr-only" role="status">
        Loading…
      </p>
      <div aria-hidden="true" className="pb-12 pt-12 sm:pb-16 sm:pt-16">
        <Skeleton className="h-4 w-20 rounded-xs" />
        <Skeleton className="mt-4 h-11 w-full max-w-md rounded-xs sm:h-14" />
      </div>
      <div
        aria-hidden="true"
        className="grid gap-10 border-t border-line py-12 sm:py-16 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-line"
      >
        {["lg:pr-8", "lg:px-8", "lg:pl-8"].map((pad) => (
          <div key={pad} className={cn("space-y-4", pad)}>
            <Skeleton className="h-4 w-16 rounded-xs" />
            <Skeleton className="h-8 w-32 rounded-xs" />
            <Skeleton className="h-4 w-full rounded-xs" />
            <Skeleton className="h-4 w-2/3 rounded-xs" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder rows for a bill list that is still loading. */
function RowsSkeleton() {
  return (
    <div className="border-y border-line">
      <p className="sr-only" role="status">
        Loading…
      </p>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="flex flex-col gap-3 border-b border-line py-5 last:border-b-0 sm:flex-row sm:justify-between sm:gap-6"
        >
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-4 w-40 rounded-xs" />
            <Skeleton className="h-5 w-full max-w-[56ch] rounded-xs" />
          </div>
          <Skeleton className="h-6 w-28 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

function AccountInner() {
  const user = useQuery(api.users.currentUser, {});
  const savedBills = useQuery(api.savedBills.listSaved, {});
  const billing = useQuery(api.billing.status, {});
  const alerts = useQuery(api.alerts.listMine, {});
  const params = useSearchParams();
  // Back from Stripe Checkout. Read once, then dropped from the address so a
  // reload or a bookmarked link cannot claim a payment that is not happening;
  // the plan card says "confirming" until the webhook records the plan.
  const [checkoutSucceeded] = React.useState(() => params.get("checkout") === "success");
  React.useEffect(() => {
    if (params.get("checkout") !== "success") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [params]);
  const { signOut } = useAuthActions();
  const [chatUsage, setChatUsage] = React.useState<ChatUsageResult | null>(null);

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    billsService
      .getChatUsage()
      .then((usage) => {
        if (!cancelled) setChatUsage(usage);
      })
      .catch(() => {
        if (!cancelled) setChatUsage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, billing?.plan]);

  // Returning from Stripe: record the return once, then the activation once
  // the webhook has flipped the plan (the page updates live when it does).
  const returnReported = React.useRef(false);
  const activationReported = React.useRef(false);
  React.useEffect(() => {
    if (!checkoutSucceeded || returnReported.current) return;
    returnReported.current = true;
    analytics.proCheckoutReturned("success");
  }, [checkoutSucceeded]);
  React.useEffect(() => {
    if (!checkoutSucceeded || activationReported.current || billing?.plan !== "pro") return;
    activationReported.current = true;
    analytics.proActivated(billing.interval ?? "unknown");
  }, [checkoutSucceeded, billing?.plan, billing?.interval]);

  if (user === undefined) return <AccountSkeleton />;

  if (user === null) {
    // Middleware should have redirected, but if a query desync happened, show a hint.
    return (
      <div className="container-editorial py-16">
        <p className="text-[15px] text-ink-2">
          Not signed in.{" "}
          <Link href="/sign-in" className="link focus-ring rounded-xs">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  const verified = Boolean(user.emailVerificationTime);
  const chatMax = chatUsage?.max ?? 100;
  const chatUsed = Math.min(chatMax, chatUsage?.used ?? 0);
  const chatRemaining = Math.max(0, chatUsage?.remaining ?? chatMax - chatUsed);
  const chatPercent = chatMax > 0 ? Math.round((chatUsed / chatMax) * 100) : 0;
  const resetLabel = chatUsage?.resetAt
    ? new Date(chatUsage.resetAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "midnight Eastern";

  return (
    <div className="container-editorial">
      <header className="pb-12 pt-12 sm:pb-16 sm:pt-16">
        <p className="label-eyebrow">Account</p>
        <h1 className="mt-3 text-display-lg text-ink [overflow-wrap:anywhere] sm:text-display-xl">
          {user.name ?? user.email ?? "Your account"}
        </h1>
      </header>

      {/* Profile, plan and usage: three columns with hairline dividers, not cards. */}
      <section aria-label="Profile, plan and usage" className="border-t border-line py-12 sm:py-16">
        <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <div className="space-y-4 pb-8 lg:pb-0 lg:pr-8">
            <h2 className="label-eyebrow">Profile</h2>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-ink-3">Name</dt>
                <dd className="mt-0.5 text-[15px] text-ink">{user.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Email</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-[15px] text-ink">
                  <span className="[overflow-wrap:anywhere]">{user.email ?? "—"}</span>
                  {verified ? (
                    <Badge variant="secondary">Verified</Badge>
                  ) : (
                    <Badge variant="outline">Unverified</Badge>
                  )}
                </dd>
              </div>
            </dl>
            {!verified && (
              <p className="text-[13px] leading-relaxed text-ink-2">
                Check your inbox for a 6-digit code to verify this address, or sign out and
                sign in again to receive a new one.
              </p>
            )}
          </div>

          <PlanCard billing={billing} checkoutSucceeded={checkoutSucceeded} />

          <div className="space-y-4 pt-8 lg:pt-0 lg:pl-8">
            <h2 className="label-eyebrow">
              {billing?.plan === "pro" ? "Questions today (Pro)" : "Questions today"}
            </h2>
            <p className="font-serif text-display-sm font-medium text-ink tabular">
              {chatUsed}
              <span className="text-title text-ink-3"> / {chatMax}</span>
            </p>
            <Progress value={chatPercent} aria-label="Bill chat usage" className="rounded-xs" />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-xs text-ink-3 tabular">
              <span>{chatRemaining} remaining today</span>
              <span>Resets at {resetLabel}</span>
            </div>
          </div>
        </div>
      </section>

      <AlertsSection alerts={alerts} isPro={billing === undefined ? undefined : billing?.plan === "pro"} />

      <section className="border-t border-line py-12 sm:py-16">
        <SectionHeader title="Saved bills" />
        <div className="mt-6">
          {savedBills === undefined ? (
            <RowsSkeleton />
          ) : savedBills.length === 0 ? (
            <p className="text-[15px] text-ink-2">
              No saved bills yet.{" "}
              <Link href="/bills" className="link focus-ring rounded-xs">
                Browse bills
              </Link>{" "}
              and tap Save on any bill to keep it here.
            </p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {savedBills.map((row) => {
                if (!row.bill) {
                  return (
                    <li key={row.billId} className="py-4">
                      <p className="text-sm text-ink-2">
                        This bill is no longer available{" "}
                        <span className="font-mono text-xs text-ink-3">({row.billId})</span>
                      </p>
                    </li>
                  );
                }
                return (
                  <li key={row.billId}>
                    <Link
                      href={`/bills/${row.billId}`}
                      className="focus-ring group flex flex-col gap-3 rounded-xs py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                    >
                      <BillHeading bill={row.bill} />
                      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
                        <BillStage description={row.bill.progressDescription} />
                        <span className="font-mono text-xs text-ink-3 tabular">
                          Saved {formatShortDate(row.savedAt)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <div className="border-t border-line pb-16 pt-8 sm:pb-24">
        <Button
          variant="outline"
          onClick={async () => {
            // Capture + reset PostHog identity before the auth state changes.
            analytics.signedOut();
            await signOut();
            window.location.href = "/";
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

/** A bill row's number, Congress and title. Its row is the link or holds it. */
function BillHeading({
  bill,
}: {
  bill: { billTypeLabel: string; billNumber: string; congress: number; title: string };
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-xs text-ink-3 tabular">
        {bill.billTypeLabel} {bill.billNumber} · {formatCongressProse(bill.congress)}
      </p>
      <p className="mt-1.5 line-clamp-3 font-serif text-title text-ink decoration-line-strong underline-offset-[3px] group-hover:underline">
        {bill.title}
      </p>
    </div>
  );
}

/** A StatusPill when the stage is one we know, else the description as text. */
function BillStage({ description, fallback }: { description: string | null; fallback?: string }) {
  const stage = stageFromDescription(description);
  if (stage !== null) return <StatusPill stage={stage} />;
  const text = description ?? fallback;
  return text ? <span className="text-[13px] text-ink-2">{text}</span> : null;
}

type BillingStatus = NonNullable<ReturnType<typeof useQuery<typeof api.billing.status>>>;

/**
 * Billing dates in US Eastern time, like the site's other clocks ("resets at
 * midnight Eastern") and the plan-change emails (convex/billingEmail.ts), so a
 * reader never sees one date here and another in their inbox. Stripe's own
 * pages follow the Stripe account's timezone, which should be set to Eastern.
 */
function formatDay(unixSeconds: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(unixSeconds * 1000));
}

/**
 * The plan's dot, in the tones the plan-change emails use (convex/billingEmail.ts,
 * Documentation/brand.md "Email"): Pro indigo, a heads-up amber, a problem the
 * error red, the free plan grey. The word beside it always says the plan.
 */
function planDotFill(billing: BillingStatus, warning: boolean): string {
  if (warning) return "bg-error";
  if (billing.plan !== "pro") return "bg-ink-3";
  return billing.cancelAtPeriodEnd ? "bg-status-passed-one" : "bg-topic-3";
}

function PlanCard({
  billing,
  checkoutSucceeded,
}: {
  billing: BillingStatus | null | undefined;
  checkoutSucceeded: boolean;
}) {
  const openPortal = useAction(api.billing.openBillingPortal);
  const [opening, setOpening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isPro = billing?.plan === "pro";

  const manage = async () => {
    setError(null);
    setOpening(true);
    try {
      const { url } = await openPortal({});
      analytics.billingPortalOpened();
      window.location.href = url;
    } catch (err) {
      const code = err instanceof ConvexError ? billingErrorCode(err.data) : "UNKNOWN";
      setError(
        code === "RATE_LIMITED"
          ? "Too many tries in a short time. Please wait a few minutes and try again."
          : code === "NO_BILLING_ACCOUNT"
            ? "There is no billing account to open any more. Subscribe again from the Pro page to start a new one."
            : "Could not open billing. Please try again.",
      );
      setOpening(false);
    }
  };

  // After a minute back from Checkout with no plan yet, say so plainly.
  const [waitedLong, setWaitedLong] = React.useState(false);
  React.useEffect(() => {
    if (!checkoutSucceeded || isPro) return;
    const timer = setTimeout(() => setWaitedLong(true), 60_000);
    return () => clearTimeout(timer);
  }, [checkoutSucceeded, isPro]);

  const view = billing
    ? planCardView(billing, { checkoutReturned: checkoutSucceeded, waitedLong, formatDate: formatDay })
    : null;
  const warning = view?.tone === "warning";

  return (
    <div className="space-y-4 py-8 lg:px-8 lg:py-0">
      <h2 className="label-eyebrow">Plan</h2>
      {billing && view ? (
        <p className="flex flex-wrap items-baseline gap-x-2.5 font-serif text-display-sm font-medium text-ink">
          <span className="inline-flex items-center gap-2.5">
            <span
              className={cn("h-2.5 w-2.5 shrink-0 rounded-full", planDotFill(billing, warning))}
              aria-hidden="true"
            />
            {view.label}
          </span>
          {view.cadence && <span className="font-sans text-[15px] text-ink-2">{view.cadence}</span>}
        </p>
      ) : (
        <Skeleton aria-hidden="true" className="h-8 w-24 rounded-xs" />
      )}
      {view && (
        <p
          role={warning ? "alert" : "status"}
          className={cn("text-[13px] leading-relaxed", warning ? "text-error" : "text-ink-2")}
        >
          {view.message}
        </p>
      )}
      {(view?.showManage || view?.subscribe) && (
        <div className="flex flex-wrap gap-3">
          {view.subscribe && (
            <Button asChild size="sm">
              <Link href="/pro">{view.subscribe}</Link>
            </Button>
          )}
          {view.showManage && (
            <Button variant="outline" size="sm" onClick={manage} disabled={opening}>
              {opening ? "Opening…" : "Manage billing"}
            </Button>
          )}
        </div>
      )}
      {error && (
        <Alert variant="destructive" className="rounded-md border-error/30 px-4 py-3 text-[13px] dark:border-error/30">
          {error}
        </Alert>
      )}
    </div>
  );
}

type AlertRows = NonNullable<ReturnType<typeof useQuery<typeof api.alerts.listMine>>>;

function AlertsSection({
  alerts,
  isPro,
}: {
  alerts: AlertRows | undefined;
  /** undefined while the plan is loading: say nothing about it yet. */
  isPro: boolean | undefined;
}) {
  // Hooks first: returning before them would change the hook count between
  // renders once the plan arrives, which React rejects.
  const toggle = useMutation(api.alerts.toggle);
  const [removing, setRemoving] = React.useState<string | null>(null);
  if (isPro === undefined) return null;

  // Nothing to show a free reader who never followed anything.
  if (!isPro && (alerts === undefined || alerts.length === 0)) return null;

  const unfollow = async (billId: string) => {
    setRemoving(billId);
    try {
      const { following } = await toggle({ billId });
      if (!following) {
        analytics.billAlertToggled({ bill_id: billId, action: "unfollowed", surface: "account" });
      }
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section id="alerts" className="scroll-mt-24 border-t border-line py-12 sm:py-16">
      <SectionHeader title="Bill alerts" />
      <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">
        {isPro
          ? "One email early in the morning, US Eastern time, on any day these bills move. Add bills with Email me updates on a bill page."
          : "Your Pro plan has ended, so these alerts are paused. Subscribe again to resume them."}
      </p>
      <div className="mt-6">
        {alerts === undefined ? (
          <RowsSkeleton />
        ) : alerts.length === 0 ? (
          <p className="text-[15px] text-ink-2">
            You don&apos;t follow any bills yet.{" "}
            <Link href="/bills" className="link focus-ring rounded-xs">
              Browse bills
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {alerts.map((row) => (
              <li
                key={row.billId}
                className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
              >
                <Link href={`/bills/${row.billId}`} className="focus-ring group min-w-0 rounded-xs">
                  {row.bill ? (
                    <BillHeading bill={row.bill} />
                  ) : (
                    <p className="text-sm text-ink-2">
                      This bill is no longer available{" "}
                      <span className="font-mono text-xs text-ink-3">({row.billId})</span>
                    </p>
                  )}
                </Link>
                <div className="flex shrink-0 flex-wrap items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
                  {row.bill && (
                    <BillStage description={row.bill.progressDescription} fallback="Status unknown" />
                  )}
                  {row.lastEmailedAt && (
                    <span className="font-mono text-xs text-ink-3 tabular">
                      Last emailed {formatShortDate(row.lastEmailedAt)}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto sm:ml-0"
                    disabled={removing === row.billId}
                    onClick={() => unfollow(row.billId)}
                  >
                    {removing === row.billId ? "Removing…" : "Unfollow"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
