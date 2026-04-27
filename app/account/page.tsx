"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConvexEnabled } from "@/app/ConvexClientProvider";

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
  const { signOut } = useAuthActions();

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

  return (
    <div className="container-editorial py-16 space-y-10">
      <header className="space-y-2">
        <p className="label-eyebrow">Account</p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          {user.name ?? user.email ?? "Your account"}
        </h1>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
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
                Verify your email before upgrading to Pro. Check your inbox for a 6-digit code, or
                sign out and sign in again to receive a new one.
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
              <p className="text-xl font-serif">{user.plan === "pro" ? "Pro" : "Free"}</p>
            </div>
            {user.plan === "pro" ? (
              <p className="text-xs text-muted-foreground">
                Billing is managed in the Stripe Customer Portal. (Coming in PR 2.)
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pro adds daily bill digests, generated bill audio, and more. Pricing page coming in PR 2.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="border-t border-border pt-6">
        <Button
          variant="outline"
          onClick={async () => {
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
