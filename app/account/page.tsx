"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";

import { api } from "@/convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { formatCongressProse } from "@/lib/congress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { billsService, type ChatUsageResult } from "@/lib/services/bills-service";

export default function AccountPage() {
  const enabled = useConvexEnabled();
  if (!enabled) {
    return (
      <div className="container-editorial py-16">
        <p className="text-sm text-muted-foreground">Loading…</p>
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
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (user === null) {
    // Middleware should have redirected, but if a query desync happened, show a hint.
    return (
      <div className="container-editorial py-16">
        <p className="text-sm text-muted-foreground">
          Not signed in.{" "}
          <Link href="/sign-in" className="underline">
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
    <div className="container-editorial py-16 space-y-10">
      <header className="space-y-2">
        <p className="label-eyebrow">Account</p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          {user.name ?? user.email ?? "Your account"}
        </h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">Name</p>
              <p>{user.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">Email</p>
              <p className="flex items-center gap-2">
                {user.email ?? "—"}
                {verified ? (
                  <span className="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Verified
                  </span>
                ) : (
                  <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Unverified
                  </span>
                )}
              </p>
            </div>
            {!verified && (
              <p className="text-xs text-muted-foreground">
                Check your inbox for a 6-digit code to verify this address, or sign out and
                sign in again to receive a new one.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">Current plan</p>
              <p className="text-xl font-serif">Free</p>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Bills.Congress is free and has no paid tier. Your account saves bills and
                conversations and raises your daily question allowance — nothing here is
                billed, and we collect no payment details.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">Free bill chat</p>
              <p className="mt-1 font-serif text-2xl">
                {chatUsed}
                <span className="text-base text-muted-foreground"> / {chatMax}</span>
              </p>
            </div>
            <Progress value={chatPercent} aria-label="Bill chat usage" />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{chatRemaining} remaining today</span>
              <span>Resets at {resetLabel}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <h2 className="font-serif text-xl font-semibold tracking-tight">Saved bills</h2>
        {savedBills === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : savedBills.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved bills yet.{" "}
            <Link href="/bills" className="underline underline-offset-4">
              Browse bills
            </Link>{" "}
            and tap Save on any bill to keep it here.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {savedBills.map((row) =>
              row.bill ? (
                <li key={row.billId}>
                  <Link
                    href={`/bills/${row.billId}`}
                    className="group flex items-baseline justify-between gap-4 py-4"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {row.bill.billTypeLabel} {row.bill.billNumber} ·{" "}
                        {formatCongressProse(row.bill.congress)}
                      </p>
                      <p className="mt-1 font-serif font-medium leading-snug group-hover:underline underline-offset-4">
                        {row.bill.title}
                      </p>
                      {row.bill.progressDescription && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.bill.progressDescription}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Saved{" "}
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                      }).format(new Date(row.savedAt))}
                    </span>
                  </Link>
                </li>
              ) : (
                <li
                  key={row.billId}
                  className="flex items-baseline justify-between gap-4 py-4"
                >
                  <p className="text-sm text-muted-foreground">
                    This bill is no longer available{" "}
                    <span className="font-mono text-xs">({row.billId})</span>
                  </p>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <div className="border-t border-border pt-6">
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
