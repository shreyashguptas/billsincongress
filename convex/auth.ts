import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { ResendOTP } from "./ResendOTP";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

// ─── Session lifetime ──────────────────────────────────────────────────────
// We want users to stay signed in for a long time across browser restarts —
// "set it and forget it" UX, no surprise sign-outs. 60 days is the chosen
// upper bound (longer than the industry default of 30, still reasonable for
// a low-risk public bills tracker; banking-grade apps would pick 15 min, we
// are explicitly the opposite).
//
// The library refreshes the JWT access token transparently every hour using
// the long-lived refresh token, so the only thing the user sees is "still
// signed in" until either:
//   (a) 60 days pass with no requests at all (inactiveDurationMs), OR
//   (b) 60 days pass since the original sign-in (totalDurationMs)
// whichever fires first. Refresh-token rotation with a 10s reuse window is
// already on by default — old tokens are invalidated on use.
//
// This MUST stay in sync with `cookieConfig.maxAge` in `proxy.ts`. The
// cookie expiry ≥ refresh-token expiry, otherwise users get signed out
// every time the cookie expires even though the server-side session is
// still valid. We use the same constant in both places.
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 60; // 60 days

function decodeRedirect(value: string): string | null {
  let current = value;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      return null;
    }
  }
  return current;
}

function hasUnsafeRedirectChars(value: string): boolean {
  return /[\\\u0000-\u001f\u007f]/.test(value);
}

function isSafeRelativeRedirect(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (hasUnsafeRedirectChars(value)) return false;
  const decoded = decodeRedirect(value);
  if (!decoded) return false;
  return !decoded.startsWith("//") && !hasUnsafeRedirectChars(decoded);
}

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
  session: {
    // Total time a session can live before forced re-auth. Hard cap.
    totalDurationMs: SESSION_DURATION_MS,
    // Time without any request before the session expires. Practically the
    // same as the total cap for our usage (active users won't go 60 days
    // silent), but the library treats them as separate gates.
    inactiveDurationMs: SESSION_DURATION_MS,
  },
  callbacks: {
    async redirect({ redirectTo }) {
      const value = redirectTo.trim();
      if (value !== redirectTo) {
        throw new Error("Invalid redirect URL.");
      }

      // Only same-origin path redirects are accepted as relative values.
      if (value.startsWith("/")) {
        if (!isSafeRelativeRedirect(value)) {
          throw new Error("Invalid redirect path.");
        }
        return value;
      }

      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error("Invalid redirect URL.");
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        hasUnsafeRedirectChars(value) ||
        hasUnsafeRedirectChars(decodeRedirect(value) ?? "")
      ) {
        throw new Error("Invalid redirect URL.");
      }
      if (!isAllowedRedirect(url)) {
        throw new Error(`Unauthorized redirect target: ${url.origin}`);
      }
      return url.toString();
    },
  },
});
