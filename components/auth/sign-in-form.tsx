"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "./google-button";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/account";
  const prefillEmail = params.get("email") ?? "";

  const [email, setEmail] = React.useState(prefillEmail);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, password, flow: "signIn" });
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
        setError("Invalid email or password. Try again, or reset your password if you forgot it.");
      } else {
        setError("Sign-in failed. Please try again in a moment.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <GoogleButton redirectTo={redirect} label="Sign in with Google" />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-background px-2 text-muted-foreground">or with email</span>
        </div>
      </div>

      <form method="post" onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
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
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="text-xs text-muted-foreground hover:text-foreground"
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
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="font-medium text-foreground hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
