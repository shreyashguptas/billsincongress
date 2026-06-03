"use client";

import * as React from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { analytics } from "@/lib/analytics";
import { markSignupCelebrationPending } from "./welcome-new-user";

interface GoogleButtonProps {
  redirectTo?: string;
  label?: string;
  celebrateOnReturn?: boolean;
}

export function GoogleButton({
  redirectTo = "/account",
  label = "Continue with Google",
  celebrateOnReturn = false,
}: GoogleButtonProps) {
  const { signIn } = useAuthActions();
  const [busy, setBusy] = React.useState(false);

  async function onClick() {
    setBusy(true);
    try {
      // Convex SITE_URL is the prod website. For local dev, we want OAuth to
      // come back to localhost, so resolve `redirectTo` against the current
      // origin and pass an absolute URL.
      const absolute = redirectTo.startsWith("http")
        ? redirectTo
        : new URL(redirectTo, window.location.origin).toString();
      // Capture intent before the full-page OAuth redirect; completion is
      // attributed after return by PostHogAuthSync.
      const intent = celebrateOnReturn ? "sign_up" : "sign_in";
      analytics.authGoogleClicked(intent);
      analytics.markPendingGoogleAuth(intent);
      if (celebrateOnReturn) markSignupCelebrationPending();
      await signIn("google", { redirectTo: absolute });
    } catch (err) {
      console.error("Google sign-in failed", err);
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full justify-center gap-2 font-sans"
      onClick={onClick}
      disabled={busy}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
      </svg>
      {label}
    </Button>
  );
}
