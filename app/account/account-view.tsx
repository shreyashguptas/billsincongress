"use client";

import * as React from "react";
import Link from "next/link";
import { ConvexError } from "convex/values";
import type { useQuery } from "convex/react";
import { Bell, Bookmark, LogOut, MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { api } from "@/convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { billingErrorCode, planCardView } from "@/lib/pro";
import { formatCongressProse } from "@/lib/congress";
import { cn } from "@/lib/utils";
import { StageTrack, StatusPill } from "@/components/brand/status";
import { AvatarMark, initialsFor, ProPill, SpectrumStrip } from "@/components/brand/pro-mark";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChatUsageResult } from "@/lib/services/bills-service";
import { BillStageDescriptions } from "@/lib/utils/bill-stages";

/**
 * The account page, drawn. Pure presentation: `page.tsx` reads Convex and
 * passes the data and the three actions in, so every plan state can be drawn
 * from plain objects. Pictures first, few words (the Learn page's language):
 * the reader as an avatar (in the spectrum ring on Pro), the plan as a card,
 * the day's questions as dots, each bill with its stage track.
 */

export type BillingStatus = NonNullable<ReturnType<typeof useQuery<typeof api.billing.status>>>;
export type AlertRows = NonNullable<ReturnType<typeof useQuery<typeof api.alerts.listMine>>>;
export type SavedRows = NonNullable<ReturnType<typeof useQuery<typeof api.savedBills.listSaved>>>;
export interface AccountUser {
  name?: string | null;
  email?: string | null;
  emailVerificationTime?: number | null;
}

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

/** The page's shape while the account loads: the you card and two cards. */
export function AccountSkeleton() {
  return (
    <div className="container-editorial pb-16 pt-12 sm:pt-16">
      <p className="sr-only" role="status">
        Loading…
      </p>
      <div aria-hidden="true" className="flex items-center gap-5 rounded-lg border border-line bg-raised p-6 sm:p-8">
        <Skeleton className="h-20 w-20 rounded-full sm:h-24 sm:w-24" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-9 w-full max-w-xs rounded-xs" />
          <Skeleton className="h-4 w-48 rounded-xs" />
        </div>
      </div>
      <div aria-hidden="true" className="mt-6 grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-64 rounded-lg lg:col-span-3" />
        <Skeleton className="h-64 rounded-lg lg:col-span-2" />
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

export function AccountView({
  user,
  billing,
  alerts,
  savedBills,
  chatUsage,
  checkoutSucceeded,
  openPortal,
  toggleAlert,
  onSignOut,
}: {
  user: AccountUser;
  billing: BillingStatus | null | undefined;
  alerts: AlertRows | undefined;
  savedBills: SavedRows | undefined;
  chatUsage: ChatUsageResult | null;
  checkoutSucceeded: boolean;
  openPortal: () => Promise<{ url: string }>;
  toggleAlert: (args: { billId: string }) => Promise<{ following: boolean }>;
  onSignOut: () => void | Promise<void>;
}) {
  const verified = Boolean(user.emailVerificationTime);
  const isPro = billing?.plan === "pro";
  const displayName = user.name ?? user.email ?? "Your account";

  return (
    <div className="container-editorial pb-16 pt-12 sm:pb-24 sm:pt-16">
      {/* You: the avatar, in the spectrum ring on Pro — the persistent Pro mark. */}
      <header className="rounded-lg border border-line bg-raised">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-7 sm:p-8">
          <AvatarMark initials={initialsFor(user.name ?? user.email)} pro={isPro} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="label-eyebrow">Account</p>
              {billing === undefined ? null : isPro ? (
                <ProPill />
              ) : (
                <Badge variant="outline" className="gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink-3" />
                  Free
                </Badge>
              )}
            </div>
            <h1 className="mt-2 text-display-md text-ink [overflow-wrap:anywhere] sm:text-display-lg">{displayName}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[15px] text-ink-2">
              <span className="[overflow-wrap:anywhere]">{user.email ?? "—"}</span>
              {verified ? <Badge variant="secondary">Verified</Badge> : <Badge variant="outline">Unverified</Badge>}
            </p>
            {!verified && (
              <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-ink-2">
                Check your inbox for a 6-digit code to verify this address, or sign out and sign in again to receive a
                new one.
              </p>
            )}
          </div>
          <Button variant="outline" onClick={onSignOut} className="self-start sm:self-center">
            <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </header>

      <section aria-label="Plan and usage" className="mt-6 grid gap-6 lg:grid-cols-5">
        <PlanCard billing={billing} checkoutSucceeded={checkoutSucceeded} openPortal={openPortal} />
        <UsageCard usage={chatUsage} isPro={isPro} />
      </section>

      <AlertsSection
        alerts={alerts}
        isPro={billing === undefined ? undefined : isPro}
        limit={billing?.limits.alertBills}
        toggleAlert={toggleAlert}
      />

      <section aria-labelledby="saved-title" className="mt-16 sm:mt-20">
        <ListHeader id="saved-title" icon={Bookmark} title="Saved bills" />
        <div className="mt-5">
          {savedBills === undefined ? (
            <RowsSkeleton />
          ) : savedBills.length === 0 ? (
            <EmptyState icon={Bookmark} line="Tap Save on any bill to keep it here." />
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
                      className="focus-ring group flex flex-col gap-3 rounded-xs py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8"
                    >
                      <BillHeading bill={row.bill} />
                      <div className="flex shrink-0 flex-col gap-2 sm:w-48 sm:items-end">
                        <BillStage description={row.bill.progressDescription} />
                        <span className="font-mono text-xs text-ink-3 tabular">Saved {formatShortDate(row.savedAt)}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/** A list's heading: an icon in a circle, the title, and whatever sits right. */
function ListHeader({ id, icon: Icon, title, right }: { id: string; icon: LucideIcon; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h2 id={id} className="flex items-center gap-3 text-display-sm text-ink">
        <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-sunken text-ink">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        {title}
      </h2>
      {right}
    </div>
  );
}

/** An empty list: a quiet picture, one line, one way forward. */
function EmptyState({ icon: Icon, line }: { icon: LucideIcon; line: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-line-strong/60 px-6 py-10 text-center">
      <span aria-hidden="true" className="relative flex h-16 w-24 items-end justify-center">
        {/* Two blank bill pages, the icon on the front one. */}
        <span className="absolute left-3 top-0 h-14 w-11 -rotate-6 rounded-sm border border-line-strong/60 bg-raised" />
        <span className="absolute right-3 top-1 flex h-14 w-11 rotate-3 items-center justify-center rounded-sm border border-ink bg-raised">
          <Icon className="h-5 w-5 text-ink" strokeWidth={1.75} />
        </span>
      </span>
      <p className="text-[15px] text-ink-2">{line}</p>
      <Button asChild variant="outline" size="sm" className="touchable:h-11">
        <Link href="/bills">Browse bills</Link>
      </Button>
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
    <div className="min-w-0 flex-1">
      <p className="font-mono text-xs text-ink-3 tabular">
        {bill.billTypeLabel} {bill.billNumber} · {formatCongressProse(bill.congress)}
      </p>
      <p className="mt-1.5 line-clamp-3 font-serif text-title text-ink decoration-line-strong underline-offset-[3px] group-hover:underline">
        {bill.title}
      </p>
    </div>
  );
}

/**
 * The stage as a pill over its seven-step track when the stage is one we
 * know, else the description as text.
 */
function BillStage({ description, fallback }: { description: string | null; fallback?: string }) {
  const stage = stageFromDescription(description);
  if (stage !== null) {
    return (
      <div className="flex w-full flex-col items-start gap-2 sm:items-end">
        <StatusPill stage={stage} />
        <StageTrack stage={stage} className="w-full max-w-[12rem]" />
      </div>
    );
  }
  const text = description ?? fallback;
  return text ? <span className="text-[13px] text-ink-2">{text}</span> : null;
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

/** What Pro includes, as icon chips. `muted` for a free reader: what it would add. */
function IncludedChips({ alertBills, questions, muted }: { alertBills: number; questions: number; muted: boolean }) {
  const chips: { icon: LucideIcon; label: string }[] = [
    { icon: Bell, label: `${alertBills} bills by email` },
    { icon: MessageCircle, label: `${questions} questions a day` },
  ];
  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map(({ icon: Icon, label }) => (
        <li
          key={label}
          className={cn(
            "flex items-center gap-2 rounded-md border py-1.5 pl-1.5 pr-3 text-[13px] tabular",
            muted ? "border-dashed border-line-strong/70 text-ink-2" : "border-line bg-sunken/60 text-ink",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full",
              muted ? "bg-sunken text-ink-2" : "bg-ink text-on-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}

function PlanCard({
  billing,
  checkoutSucceeded,
  openPortal,
}: {
  billing: BillingStatus | null | undefined;
  checkoutSucceeded: boolean;
  openPortal: () => Promise<{ url: string }>;
}) {
  const [opening, setOpening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isPro = billing?.plan === "pro";

  const manage = async () => {
    setError(null);
    setOpening(true);
    try {
      const { url } = await openPortal();
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
  // A healthy Pro plan wears the spectrum; a problem does not.
  const proMark = isPro && !warning;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-raised lg:col-span-3",
        warning ? "border-error/50" : "border-line",
      )}
    >
      {proMark && <SpectrumStrip />}
      <div className="flex flex-1 flex-col gap-5 p-6 sm:p-8">
        <h2 className="label-eyebrow">Plan</h2>
        {billing && view ? (
          <p className="-mt-2 flex flex-wrap items-baseline gap-x-3 font-serif text-display-md font-medium text-ink">
            <span className="inline-flex items-center gap-3">
              <span
                className={cn("h-3 w-3 shrink-0 rounded-full", planDotFill(billing, warning))}
                aria-hidden="true"
              />
              {view.label}
            </span>
            {view.cadence && <span className="font-sans text-[15px] text-ink-2">{view.cadence}</span>}
          </p>
        ) : (
          <Skeleton aria-hidden="true" className="h-10 w-28 rounded-xs" />
        )}
        {view && (
          <p
            role={warning ? "alert" : "status"}
            className={cn("max-w-[56ch] text-[15px] leading-relaxed", warning ? "text-error" : "text-ink-2")}
          >
            {view.message}
          </p>
        )}
        {billing && view && (isPro || view.subscribe) && (
          <div className="space-y-2">
            {!isPro && <p className="label-eyebrow">Pro adds</p>}
            <IncludedChips
              alertBills={billing.limits.alertBills}
              questions={billing.limits.questionsPerDay}
              muted={!isPro}
            />
          </div>
        )}
        {(view?.showManage || view?.subscribe) && (
          <div className="mt-auto flex flex-wrap gap-3 pt-1">
            {view.subscribe && (
              <Button asChild>
                <Link href="/pro">{view.subscribe}</Link>
              </Button>
            )}
            {view.showManage && (
              <Button variant="outline" onClick={manage} disabled={opening}>
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
    </div>
  );
}

/**
 * Today's questions as a grid of 100 dots, each dot a fixed share of the day's
 * allowance, filled in ink as questions are asked.
 */
function UsageCard({ usage, isPro }: { usage: ChatUsageResult | null; isPro: boolean }) {
  const max = usage?.max ?? 100;
  const used = Math.min(max, usage?.used ?? 0);
  const remaining = Math.max(0, usage?.remaining ?? max - used);
  const dots = Math.min(100, Math.max(1, max));
  const per = max / dots;
  const filled = used === 0 ? 0 : Math.min(dots, Math.ceil(used / per));
  const resetLabel = usage?.resetAt
    ? new Date(usage.resetAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "midnight Eastern";

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-line bg-raised p-6 sm:p-8 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="label-eyebrow">Questions today</h2>
        {isPro && <ProPill className="tabular">{max} a day</ProPill>}
      </div>
      <p className="-mt-2 font-serif text-display-md font-medium text-ink tabular">
        {used}
        <span className="text-title text-ink-3"> / {max}</span>
      </p>
      <div
        role="img"
        aria-label={`${used} of ${max} questions asked today. ${remaining} remaining.`}
        className="grid gap-1"
        style={{ gridTemplateColumns: "repeat(20, minmax(0, 1fr))" }}
      >
        {Array.from({ length: dots }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn("aspect-square rounded-full", i < filled ? "bg-ink" : "bg-ink/10")}
          />
        ))}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-xs text-ink-3 tabular">
        <span>{remaining} remaining</span>
        <span>{per === 1 ? "1 dot = 1 question" : `1 dot = ${Number.isInteger(per) ? per : per.toFixed(1)} questions`}</span>
        <span className="w-full">Resets at {resetLabel}</span>
      </div>
    </div>
  );
}

function AlertsSection({
  alerts,
  isPro,
  limit,
  toggleAlert,
}: {
  alerts: AlertRows | undefined;
  /** undefined while the plan is loading: say nothing about it yet. */
  isPro: boolean | undefined;
  limit: number | undefined;
  toggleAlert: (args: { billId: string }) => Promise<{ following: boolean }>;
}) {
  // Hooks first: returning before them would change the hook count between
  // renders once the plan arrives, which React rejects.
  const [removing, setRemoving] = React.useState<string | null>(null);
  if (isPro === undefined) return null;

  // Nothing to show a free reader who never followed anything.
  if (!isPro && (alerts === undefined || alerts.length === 0)) return null;

  const unfollow = async (billId: string) => {
    setRemoving(billId);
    try {
      const { following } = await toggleAlert({ billId });
      if (!following) {
        analytics.billAlertToggled({ bill_id: billId, action: "unfollowed", surface: "account" });
      }
    } finally {
      setRemoving(null);
    }
  };

  const count = alerts?.length ?? 0;

  return (
    <section id="alerts" aria-labelledby="alerts-title" className="mt-16 scroll-mt-24 sm:mt-20">
      <ListHeader
        id="alerts-title"
        icon={Bell}
        title="Bill alerts"
        right={
          alerts !== undefined && limit ? (
            <div className="flex w-40 flex-col gap-1.5" role="img" aria-label={`Following ${count} of ${limit} bills`}>
              <span className="font-mono text-xs text-ink-3 tabular" aria-hidden="true">
                <span className="text-ink">{count}</span> / {limit} bills
              </span>
              <span aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-xs bg-sunken">
                <span className="block h-full bg-ink" style={{ width: `${Math.min(100, (count / limit) * 100)}%` }} />
              </span>
            </div>
          ) : null
        }
      />
      <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">
        {isPro
          ? "One email early in the morning, US Eastern time, on any day these bills move."
          : "Your Pro plan has ended, so these alerts are paused. Subscribe again to resume them."}
      </p>
      <div className="mt-5">
        {alerts === undefined ? (
          <RowsSkeleton />
        ) : alerts.length === 0 ? (
          <EmptyState icon={Bell} line="Press Email me updates on any bill page." />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {alerts.map((row) => (
              <li
                key={row.billId}
                className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8"
              >
                <Link href={`/bills/${row.billId}`} className="focus-ring group min-w-0 flex-1 rounded-xs">
                  {row.bill ? (
                    <BillHeading bill={row.bill} />
                  ) : (
                    <p className="text-sm text-ink-2">
                      This bill is no longer available{" "}
                      <span className="font-mono text-xs text-ink-3">({row.billId})</span>
                    </p>
                  )}
                </Link>
                <div className="flex shrink-0 flex-col gap-2 sm:w-48 sm:items-end">
                  {row.bill && <BillStage description={row.bill.progressDescription} fallback="Status unknown" />}
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-2">
                    {row.lastEmailedAt ? (
                      <span className="font-mono text-xs text-ink-3 tabular">
                        Last emailed {formatShortDate(row.lastEmailedAt)}
                      </span>
                    ) : (
                      <span />
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="touchable:h-11"
                      disabled={removing === row.billId}
                      onClick={() => unfollow(row.billId)}
                    >
                      {removing === row.billId ? "Removing…" : "Unfollow"}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
