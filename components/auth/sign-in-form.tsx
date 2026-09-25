"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { analytics } from "@/lib/analytics";
import { AuthDivider } from "./auth-card";
import { GoogleButton } from "./google-button";
import { safeRedirect } from "./safe-redirect";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const params = useSearchParams();
  const redirect = safeRedirect(params.get("redirect"));
  const prefillEmail = params.get("email") ?? "";

  const [email, setEmail] = React.useState(prefillEmail);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    analytics.signinSubmitted();
    try {
      await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        flow: "signIn",
      });
      analytics.signinCompleted("password");
      router.push(redirect);
    } catch (err) {
      // console.warn (not error) so the Next.js dev overlay doesn't pop for
      // expected auth failures like wrong password — those should only be
      // shown via the friendly form message below.
      console.warn("Sign-in failed", err);
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      // Vague error on sign-in (no email enumeration). Wrong-email and
      // wrong-password both surface as "InvalidAccountId" or as the wrapped
      // generic "Server Error" — both should look identical to the user.
      if (
        msg.includes("invalidaccountid") ||
        msg.includes("invalid credentials") ||
        msg.includes("server error") ||
        msg.includes("[request id")
      ) {
        analytics.signinFailed("invalid_credentials");
        setError("Invalid email or password. Try again, or reset your password if you forgot it.");
      } else {
        analytics.signinFailed("other");
        setError("Sign-in failed. Please try again in a moment.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <GoogleButton redirectTo={redirect} label="Sign in with Google" />

      <AuthDivider>or with email</AuthDivider>

      <form method="post" onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-ink">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password" className="text-ink">Password</Label>
            <Link
              href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="link focus-ring rounded-xs text-[13px]"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </div>
        {error && (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-3">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="link focus-ring rounded-xs font-medium">
          Sign up
        </Link>
      </p>
    </div>
  );
}
