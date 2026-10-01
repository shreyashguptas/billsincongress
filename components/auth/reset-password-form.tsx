"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { analytics, type PasswordResetSurface } from "@/lib/analytics";
import { FormError } from "./auth-card";
import { PASSWORD_RULES, validatePassword } from "./password-rules";
import { safeRedirect, withRedirect } from "./safe-redirect";

type Step = "request" | "reset";

// The reset step's two quiet actions, as on the sign-up verify step.
const SECONDARY_ACTION = "rounded-xs font-normal text-ink-2 hover:text-ink";

/**
 * Self-serve password reset: email → 6-digit code + new password → signed in.
 * Runs the Password provider's "reset" and "reset-verification" flows
 * (convex/auth.ts, convex/emailCodes.ts). A successful reset signs the reader
 * in here and signs out every other session on the account.
 *
 * Two homes. On /forgot-password a signed-out reader types an email, and the
 * form never reveals whether it has an account. On /account ("Change
 * password") `accountEmail` is the signed-in reader's own address: there is
 * no email field, and `onChanged` runs instead of the redirect.
 */
export function ResetPasswordForm({
  accountEmail,
  onChanged,
}: {
  accountEmail?: string;
  onChanged?: () => void;
} = {}) {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const params = useSearchParams();
  const redirect = safeRedirect(params.get("redirect"));
  const surface: PasswordResetSurface = accountEmail ? "account" : "forgot_password";

  const [step, setStep] = React.useState<Step>("request");
  const [email, setEmail] = React.useState(accountEmail ?? "");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resent, setResent] = React.useState(false);

  async function requestCode(address: string) {
    try {
      await signIn("password", { email: address, flow: "reset" });
    } catch (err) {
      // Advance whatever went wrong. An email with no password account
      // throws here and one with an account does not, so showing the error
      // would tell anyone which addresses are registered (same as sign-up).
      console.warn("Password reset request failed", err);
    }
  }

  async function onRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    analytics.passwordResetRequested(surface);
    const normalizedEmail = email.trim().toLowerCase();
    setEmail(normalizedEmail);
    await requestCode(normalizedEmail);
    setResent(false);
    setStep("reset");
    setBusy(false);
  }

  async function onResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }
    setBusy(true);
    setError(null);
    analytics.passwordResetSubmitted(surface);
    try {
      await signIn("password", {
        email,
        code,
        newPassword: password,
        flow: "reset-verification",
      });
      analytics.passwordResetCompleted(surface);
      if (onChanged) onChanged();
      else router.push(redirect);
    } catch (err) {
      console.warn("Password reset failed", err);
      // The server's password rules throw a ConvexError carrying the reason;
      // everything else (wrong or expired code, too many tries, no account)
      // gets the one message, so it too reveals nothing about the address.
      if (err instanceof ConvexError && typeof err.data === "string") {
        analytics.passwordResetFailed(surface, "password_requirements");
        setError(err.data);
      } else {
        analytics.passwordResetFailed(surface, "invalid_code");
        setError("That code didn't work or has expired. Check your email, or send a new code.");
      }
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError(null);
    analytics.passwordResetCodeResent(surface);
    await requestCode(email);
    setResent(true);
    setBusy(false);
  }

  if (step === "reset") {
    return (
      <div className="space-y-6">
        <p className="text-[15px] leading-relaxed text-ink-2">
          {accountEmail ? (
            <>We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>.</>
          ) : (
            <>
              If <span className="font-medium text-ink">{email}</span> has an account with a
              password, we sent it a 6-digit code.
            </>
          )}{" "}
          It expires in 15 minutes.
        </p>
        <form method="post" onSubmit={onResetSubmit} className="space-y-5">
          {/* Tells a password manager which account the new password belongs to. */}
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
          <div className="space-y-2">
            <Label htmlFor="code" className="text-ink">Reset code</Label>
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
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-ink">New password</Label>
            <Input
              id="new-password"
              name="new-password"
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
          {error && <FormError>{error}</FormError>}
          {resent && !error && (
            <p role="status" className="text-[13px] leading-snug text-ink-3">
              {accountEmail ? "A new code is on its way." : "If the address has an account, a new code is on its way."}{" "}
              Up to five codes an hour.
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>
            {busy ? "Resetting…" : "Set new password"}
          </Button>
        </form>
        <div className={cn("flex items-center text-sm", accountEmail ? "justify-end" : "justify-between")}>
          {!accountEmail && (
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setStep("request");
                setCode("");
                setPassword("");
                setError(null);
              }}
              className={SECONDARY_ACTION}
              disabled={busy}
            >
              ← Use a different email
            </Button>
          )}
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

  if (accountEmail) {
    return (
      <form method="post" onSubmit={onRequestSubmit} className="space-y-5">
        <p className="text-[15px] leading-relaxed text-ink-2">
          We&apos;ll email a 6-digit code to <span className="font-medium text-ink">{email}</span>. Enter
          it with your new password. Every other device signed in to this account will be signed out.
        </p>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Sending…" : "Email me a code"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <form method="post" onSubmit={onRequestSubmit} className="space-y-5">
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
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Sending…" : "Send reset code"}
        </Button>
      </form>

      <p className="text-center text-[13px] leading-snug text-ink-3">
        Signed up with Google? There is no password to reset — use Sign in with Google.
      </p>

      <p className="text-center text-sm">
        <Link href={withRedirect("/sign-in", redirect)} className="link focus-ring rounded-xs">
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}
