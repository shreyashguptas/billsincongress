/**
 * The two emailed 6-digit codes: sign-up verification and password reset.
 * Both are sent through PostHog (convex/posthogEmail.ts) on the "codes"
 * stream, directly from the sign-in request — never queued — so a reader
 * waiting on the code gets it, or an error, right away.
 *
 * The provider ids keep their original "resend-otp" names on purpose: the
 * auth library stores the id on every code it issues, and renaming it would
 * void the codes readers already hold when the change deploys.
 */
import type { EmailConfig } from "@convex-dev/auth/server";
import type { EmailProviderSendVerificationRequestParams } from "@auth/core/providers/email";
import type { ActionCtx } from "./_generated/server";
import { rateLimiter } from "./rateLimits";
import { sendEmail } from "./posthogEmail";
import { CODE_LIFETIME_MINUTES, renderCodeEmail, type CodePurpose } from "./codeEmail";

function generateOTP(): string {
  // Web Crypto is available in the Convex runtime.
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 6; i++) out += (buf[i] % 10).toString();
  return out;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function codeProvider(opts: { id: string; purpose: CodePurpose; failure: string }): EmailConfig {
  return {
    id: opts.id,
    type: "email",
    name: "Email code",
    maxAge: CODE_LIFETIME_MINUTES * 60,
    async generateVerificationToken() {
      return generateOTP();
    },
    // @convex-dev/auth passes the action `ctx` as a second argument at
    // runtime (see signIn.js in the library); the Auth.js type leaves it out.
    async sendVerificationRequest(
      { identifier: email, token }: EmailProviderSendVerificationRequestParams,
      ctx?: ActionCtx,
    ) {
      if (!ctx) throw new Error("Email code sent outside a Convex action.");
      const to = normalizeEmail(email);
      // Throws ConvexError when the bucket is empty; the auth library shows
      // it to the reader. Both providers share one budget per address: it caps
      // email-bombing a victim's inbox and slows guessing the 6-digit space.
      await rateLimiter.limit(ctx, "otpRequestPerEmail", { key: to, throws: true });
      try {
        const message = renderCodeEmail(opts.purpose, token);
        await sendEmail("codes", {
          to,
          subject: message.subject,
          text: message.text,
          html: message.bodyHtml,
        });
      } catch (err) {
        console.error(`${opts.id} email failed`, err);
        throw new Error(opts.failure);
      }
    },
  };
}

export const EmailVerificationCode = codeProvider({
  id: "resend-otp",
  purpose: "verify",
  failure: "Could not send verification email.",
});

export const PasswordResetCode = codeProvider({
  // A distinct id from the verification code: the auth library tells the
  // verify-email and reset-password flows apart by it.
  id: "resend-otp-password-reset",
  purpose: "reset",
  failure: "Could not send password-reset email.",
});
