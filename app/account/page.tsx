"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";

import { api } from "@/convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { formatCongressProse } from "@/lib/congress";
import { StatusPill } from "@/components/brand/status";
import { SectionHeader } from "@/components/brand/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { billsService, type ChatUsageResult } from "@/lib/services/bills-service";
import { BillStageDescriptions } from "@/lib/utils/bill-stages";

/**
 * `listSaved` returns a bill's stage as its description ("In Committee"), the
 * same string `getStageDescription` produces. Map it back to the stage code so
 * the row can carry a StatusPill; anything unrecognised stays plain text.
 */
function stageFromDescription(description: string | null): number | null {
  if (!description) return null;
  const match = Object.entries(BillStageDescriptions).find(([, label]) => label === description);
  return match ? Number(match[0]) : null;
}

export default function AccountPage() {
  const enabled = useConvexEnabled();
  if (!enabled) {
    return (
      <div className="container-editorial py-16">
        <p className="text-sm text-ink-2">Loading…</p>
      </div>
    );
  }
  return <AccountInner />;
}

function AccountInner() {
  const user = useQuery(api.users.currentUser, {});
  const savedBills = useQuery(api.savedBills.listSaved, {});
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
  }, [user]);

  if (user === undefined) {
    return (
      <div className="container-editorial py-16">
        <p className="text-sm text-ink-2">Loading…</p>
      </div>
    );
  }

  if (user === null) {
    // Middleware should have redirected, but if a query desync happened, show a hint.
    return (
      <div className="container-editorial py-16">
        <p className="text-sm text-ink-2">
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
        <div className="grid gap-10 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-line">
          <div className="space-y-4 lg:pr-8">
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
                    <Badge variant="muted">Verified</Badge>
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

          <div className="space-y-4 lg:px-8">
            <h2 className="label-eyebrow">Plan</h2>
            <p className="font-serif text-display-sm font-medium text-ink">Free</p>
            <p className="text-[13px] leading-relaxed text-ink-2">
              Bills in Congress is free and has no paid tier. Your account saves bills and
              conversations and raises your daily question allowance — nothing here is
              billed, and we collect no payment details.
            </p>
          </div>

          <div className="space-y-4 lg:pl-8">
            <h2 className="label-eyebrow">Free bill chat</h2>
            <p className="font-serif text-display-sm font-medium text-ink tabular">
              {chatUsed}
              <span className="text-title text-ink-3"> / {chatMax}</span>
            </p>
            <Progress value={chatPercent} aria-label="Bill chat usage" className="rounded-xs" />
            <div className="flex items-center justify-between gap-3 font-mono text-xs text-ink-3 tabular">
              <span>{chatRemaining} remaining today</span>
              <span>Resets at {resetLabel}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line py-12 sm:py-16">
        <SectionHeader title="Saved bills" />
        <div className="mt-6">
          {savedBills === undefined ? (
            <p className="text-sm text-ink-2">Loading…</p>
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
                const stage = stageFromDescription(row.bill.progressDescription);
                return (
                  <li key={row.billId}>
                    <Link
                      href={`/bills/${row.billId}`}
                      className="focus-ring group flex flex-col gap-3 rounded-xs py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-ink-3 tabular">
                          {row.bill.billTypeLabel} {row.bill.billNumber} ·{" "}
                          {formatCongressProse(row.bill.congress)}
                        </p>
                        <p className="mt-1.5 line-clamp-3 font-serif text-title text-ink decoration-line-strong underline-offset-[3px] group-hover:underline">
                          {row.bill.title}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
                        {stage !== null ? (
                          <StatusPill stage={stage} />
                        ) : (
                          row.bill.progressDescription && (
                            <span className="text-[13px] text-ink-2">{row.bill.progressDescription}</span>
                          )
                        )}
                        <span className="font-mono text-xs text-ink-3 tabular">
                          Saved{" "}
                          {new Intl.DateTimeFormat("en-US", {
                            month: "short",
                            day: "numeric",
                          }).format(new Date(row.savedAt))}
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
