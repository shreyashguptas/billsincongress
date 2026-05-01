import Resend from "@auth/core/providers/resend";
import { Resend as ResendAPI } from "resend";
import type { ActionCtx } from "./_generated/server";
import { rateLimiter } from "./rateLimits";

// 6-digit numeric verification code, expires in 15 minutes.
// Used on signup and on `resendVerificationEmail`.

function generateOTP(): string {
  // Web Crypto is available in the Convex runtime.
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 6; i++) out += (buf[i] % 10).toString();
  return out;
}

export const ResendOTP = Resend({
  id: "resend-otp",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 15, // 15 minutes
  async generateVerificationToken() {
    return generateOTP();
  },
  // @convex-dev/auth passes the action `ctx` as a second arg at runtime
  // (suppressed in the upstream type signature; see signIn.js in the
  // library). We use it to rate-limit OTP issuance per email.
  // @ts-expect-error second arg is runtime-only on the upstream type
  async sendVerificationRequest({ identifier: email, provider, token }, ctx: ActionCtx) {
    // Throws ConvexError if the bucket is empty — caller (auth library)
    // surfaces it to the client. Caps email-bombing of a victim's inbox
    // and slows brute-forcing the 6-digit code space.
    await rateLimiter.limit(ctx, "otpRequestPerEmail", {
      key: email,
      throws: true,
    });
    const resend = new ResendAPI(provider.apiKey);
    const from = process.env.AUTH_EMAIL_FROM ?? "Bills.Congress <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: "Verify your email — Bills.Congress",
      text: [
        `Your verification code is ${token}.`,
        "",
        "It expires in 15 minutes.",
        "",
        "If you didn't request this, you can safely ignore it.",
      ].join("\n"),
    });
    if (error) {
      console.error("Resend verification email failed", error);
      throw new Error("Could not send verification email.");
    }
  },
});
