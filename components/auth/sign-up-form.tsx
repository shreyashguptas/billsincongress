"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { analytics } from "@/lib/analytics";
import { AuthDivider } from "./auth-card";
import { GoogleButton } from "./google-button";
import { safeRedirect } from "./safe-redirect";
import { markSignupCelebrationPending } from "./welcome-new-user";

type Step = "credentials" | "verify";

const PASSWORD_RULES = "At least 10 characters, with upper-, lower-case, and a number.";

// The verify step's two quiet actions: link Buttons at text height, in ink-2
// so the submit stays the one strong control.
const SECONDARY_ACTION = "rounded-xs font-normal text-ink-2 hover:text-ink";

type ErrorState =
  | null
  | { kind: "message"; text: string };

export function SignUpForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const params = useSearchParams();
  const redirect = safeRedirect(params.get("redirect"));

  const [step, setStep] = React.useState<Step>("credentials");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<ErrorState>(null);

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
      setError({ kind: "message", text: pwError });
      return;
    }
    setBusy(true);
    setError(null);
    analytics.signupFormSubmitted();
    const normalizedEmail = email.trim().toLowerCase();
    try {
      await signIn("password", {
        email: normalizedEmail,
        password,
        flow: "signUp",
      });
      setEmail(normalizedEmail);
      setStep("verify");
    } catch (err) {
      console.warn("Sign-up failed", err);
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("password")) {
        analytics.signupFailed("credentials", "password_requirements");
        setError({
          kind: "message",
          text: "Password didn't meet requirements. " + PASSWORD_RULES,
        });
      } else {
        setEmail(normalizedEmail);
        setStep("verify");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    analytics.signupVerificationSubmitted();
    try {
      await signIn("password", {
        email: email.trim().toLowerCase(),
        code,
        flow: "email-verification",
      });
      analytics.signupCompleted("password");
      markSignupCelebrationPending();
      router.push(redirect);
    } catch (err) {
      console.warn("Verification failed", err);
      analytics.signupFailed("verification", "invalid_code");
      setError({
        kind: "message",
        text: "That code didn't work. Check your email and try again.",
      });
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError(null);
    analytics.signupVerificationCodeResent();
    try {
      // Re-running signUp re-sends the code through the verify provider.
      await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        flow: "signUp",
      });
    } catch (err) {
      console.warn("Resend failed", err);
    } finally {
      setBusy(false);
    }
  }

  if (step === "verify") {
    return (
      <div className="space-y-6">
        <p className="text-[15px] leading-relaxed text-ink-2">
          If this email can be used, we sent a 6-digit code to <span className="font-medium text-ink">{email}</span>.
          It expires in 15 minutes.
        </p>
        <form
          method="post"
          onSubmit={onVerifySubmit}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="code" className="text-ink">Verification code</Label>
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
              className="text-center font-mono text-lg tracking-[0.3em] tabular"
            />
          </div>
          {error?.kind === "message" && <FormError>{error.text}</FormError>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>
            {busy ? "Verifying…" : "Verify email"}
          </Button>
        </form>
        <div className="flex items-center justify-between text-sm">
          <Button
            type="button"
            variant="link"
            onClick={() => setStep("credentials")}
            className={SECONDARY_ACTION}
            disabled={busy}
          >
            ← Use a different email
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={onResend}
            className={SECONDARY_ACTION}
            disabled={busy}
          >
            Resend code
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GoogleButton redirectTo={redirect} label="Sign up with Google" celebrateOnReturn />

      <AuthDivider>or with email</AuthDivider>

      <form
        method="post"
        onSubmit={onCredentialsSubmit}
        className="space-y-5"
      >
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
          <Label htmlFor="password" className="text-ink">Password</Label>
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
          <p id="password-rules" className="text-[13px] leading-snug text-ink-3">
            {PASSWORD_RULES}
          </p>
        </div>
        {error?.kind === "message" && <FormError>{error.text}</FormError>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-3">
        Already have an account?{" "}
        <Link href="/sign-in" className="link focus-ring rounded-xs font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}

/** The one line of error text under the fields. Alert brings role="alert". */
function FormError({ children }: { children: React.ReactNode }) {
  return (
    <Alert variant="destructive" className="border-0 p-0">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
