import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { ResendOTP } from "./ResendOTP";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

// Allow-list for OAuth `redirectTo`. The library defaults to "starts with
// SITE_URL only" which blocks local dev (we test from http://localhost:3000
// while SITE_URL is the prod site). We tightly restrict the dev allow-list:
// HTTP only, the specific dev port, and the same hostnames Next.js binds.
function isAllowedRedirect(url: URL): boolean {
  const PROD_HOSTS = new Set([
    "billsincongress.com",
    "www.billsincongress.com",
  ]);
  if (url.protocol === "https:" && PROD_HOSTS.has(url.host)) return true;

  const DEV_HOSTS = new Set(["localhost:3000", "127.0.0.1:3000"]);
  if (url.protocol === "http:" && DEV_HOSTS.has(url.host)) return true;

  return false;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Google OAuth — uses AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET.
    Google,

    // Email + password with scrypt hashing (library default).
    // Email verification + password reset are routed through Resend OTP helpers.
    Password({
      verify: ResendOTP,
      reset: ResendOTPPasswordReset,
      validatePasswordRequirements: (password: string) => {
        if (password.length < 10) {
          throw new ConvexError("Password must be at least 10 characters.");
        }
        if (
          !/[a-z]/.test(password) ||
          !/[A-Z]/.test(password) ||
          !/\d/.test(password)
        ) {
          throw new ConvexError(
            "Password must contain uppercase, lowercase, and a number.",
          );
        }
      },
    }),
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      // Relative paths are always safe — the library resolves them against SITE_URL.
      if (!redirectTo.startsWith("http://") && !redirectTo.startsWith("https://")) {
        return redirectTo;
      }
      let url: URL;
      try {
        url = new URL(redirectTo);
      } catch {
        throw new Error(`Invalid redirect URL: ${redirectTo}`);
      }
      if (!isAllowedRedirect(url)) {
        throw new Error(`Unauthorized redirect target: ${url.origin}`);
      }
      return redirectTo;
    },
  },
});
