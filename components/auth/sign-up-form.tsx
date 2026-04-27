"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "./google-button";

type Step = "credentials" | "verify";

const PASSWORD_RULES = "At least 10 characters, with upper-, lower-case, and a number.";

export function SignUpForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/account";

  const [step, setStep] = React.useState<Step>("credentials");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function validatePassword(pw: string): string | null {
    if (pw.length < 10) return "Password must be at least 10 characters.";
    if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) {
      return "Password needs upper-, lower-case, and a number.";
    }
    return null;
  }

  async function onCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, password, flow: "signUp" });
      setStep("verify");
    } catch (err) {
      console.error("Sign-up failed", err);
      setError(
        err instanceof Error && err.message.toLowerCase().includes("already")
          ? "An account with that email already exists. Try signing in."
          : "Sign-up failed. Try a different email or check your password.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", {
        email,
        code,
        flow: "email-verification",
      });
      router.push(redirect);
    } catch (err) {
      console.error("Verification failed", err);
      setError("That code didn't work. Check your email and try again.");
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError(null);
    try {
      // Re-running signUp re-sends the code through the verify provider.
      await signIn("password", { email, password, flow: "signUp" });
    } catch (err) {
      console.error("Resend failed", err);
      setError("Could not resend the code. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "verify") {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
            It expires in 15 minutes.
          </p>
        </div>
        <form
          method="post"
          onSubmit={onVerifySubmit}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              disabled={busy}
              className="font-mono tracking-widest text-center"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
            {busy ? "Verifying…" : "Verify email"}
          </Button>
        </form>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setStep("credentials")}
            className="text-muted-foreground hover:text-foreground"
            disabled={busy}
          >
            ← Use a different email
          </button>
          <button
            type="button"
            onClick={onResend}
            className="text-muted-foreground hover:text-foreground"
            disabled={busy}
          >
            Resend code
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GoogleButton redirectTo={redirect} label="Sign up with Google" />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-background px-2 text-muted-foreground">or with email</span>
        </div>
      </div>

      <form
        method="post"
        onSubmit={onCredentialsSubmit}
        className="space-y-4"
      >
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            aria-describedby="password-rules"
          />
          <p id="password-rules" className="text-xs text-muted-foreground">
            {PASSWORD_RULES}
          </p>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
