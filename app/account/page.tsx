"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";

import { api } from "@/convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { initialsFor } from "@/components/brand/pro-mark";
import { billsService, type ChatUsageResult } from "@/lib/services/bills-service";
import { AccountSkeleton, AccountView } from "./account-view";

// The celebration (confetti + "Welcome to Pro") loads only when a checkout
// has just turned the plan Pro, so no other visit pays for it.
const WelcomeToPro = dynamic(() => import("@/components/pro/welcome-to-pro"), { ssr: false });

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

function AccountInner() {
  const user = useQuery(api.users.currentUser, {});
  const savedBills = useQuery(api.savedBills.listSaved, {});
  const billing = useQuery(api.billing.status, {});
  const alerts = useQuery(api.alerts.listMine, {});
  const openPortal = useAction(api.billing.openBillingPortal);
  const toggleAlert = useMutation(api.alerts.toggle);
  const params = useSearchParams();
  // Back from Stripe Checkout. Read once, then dropped from the address so a
  // reload or a bookmarked link cannot claim a payment that is not happening
  // (or replay the celebration); the plan card says "confirming" until the
  // webhook records the plan.
  const [checkoutSucceeded] = React.useState(() => params.get("checkout") === "success");
  React.useEffect(() => {
    if (params.get("checkout") !== "success") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [params]);
  const { signOut } = useAuthActions();
  const [chatUsage, setChatUsage] = React.useState<ChatUsageResult | null>(null);
  const [celebrating, setCelebrating] = React.useState(false);

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
  // The activation is also the one moment the page celebrates: only a real
  // Pro plan, never the success URL alone, and once per checkout.
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
    setCelebrating(true);
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

  return (
    <>
      <AccountView
        user={user}
        billing={billing}
        alerts={alerts}
        savedBills={savedBills}
        chatUsage={chatUsage}
        checkoutSucceeded={checkoutSucceeded}
        openPortal={() => openPortal({})}
        toggleAlert={toggleAlert}
        onSignOut={async () => {
          // Capture + reset PostHog identity before the auth state changes.
          analytics.signedOut();
          await signOut();
          window.location.href = "/";
        }}
      />
      {/* Announced politely, whether or not the dialog takes focus. */}
      <p className="sr-only" aria-live="polite">
        {celebrating ? "Welcome to Pro. Your plan is active." : ""}
      </p>
      {celebrating && billing && (
        <WelcomeToPro
          open={celebrating}
          onOpenChange={setCelebrating}
          initials={initialsFor(user.name ?? user.email)}
          questionsPerDay={billing.limits.questionsPerDay}
          alertBills={billing.limits.alertBills}
        />
      )}
    </>
  );
}
