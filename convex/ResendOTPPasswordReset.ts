import Resend from "@auth/core/providers/resend";
import { Resend as ResendAPI } from "resend";

// Distinct provider id from ResendOTP — the auth library uses the id
// to differentiate verify-email vs reset-password code flows.

function generateOTP(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 6; i++) out += (buf[i] % 10).toString();
  return out;
}

export const ResendOTPPasswordReset = Resend({
  id: "resend-otp-password-reset",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return generateOTP();
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);
    const from = process.env.AUTH_EMAIL_FROM ?? "Bills.Congress <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: [email],
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
