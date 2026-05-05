import Resend from "@auth/core/providers/resend";
import { Resend as ResendAPI } from "resend";
import type { ActionCtx } from "./_generated/server";
import { rateLimiter } from "./rateLimits";

// Distinct provider id from ResendOTP — the auth library uses the id
// to differentiate verify-email vs reset-password code flows.

function generateOTP(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 6; i++) out += (buf[i] % 10).toString();
  return out;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const ResendOTPPasswordReset = Resend({
  id: "resend-otp-password-reset",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return generateOTP();
  },
  // Shares the `otpRequestPerEmail` bucket with ResendOTP — sending a
  // password-reset code and a signup-verify code to the same address are
  // equivalently abusable surfaces and should share one budget.
  // @ts-expect-error second arg is runtime-only on the upstream type
  async sendVerificationRequest({ identifier: email, provider, token }, ctx: ActionCtx) {
    const normalizedEmail = normalizeEmail(email);
    await rateLimiter.limit(ctx, "otpRequestPerEmail", {
      key: normalizedEmail,
      throws: true,
    });
    const resend = new ResendAPI(provider.apiKey);
    const from = process.env.AUTH_EMAIL_FROM ?? "Bills.Congress <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: [normalizedEmail],
      subject: "Reset your password — Bills.Congress",
      text: [
        `Your password-reset code is ${token}.`,
        "",
        "It expires in 15 minutes.",
        "",
        "If you didn't request this, your account is safe — you can ignore it.",
      ].join("\n"),
    });
    if (error) {
      console.error("Resend password-reset email failed", error);
      throw new Error("Could not send password-reset email.");
    }
  },
});
