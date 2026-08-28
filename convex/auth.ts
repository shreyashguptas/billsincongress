import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { ResendOTP } from "./ResendOTP";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

// Sessions last 60 days: the library transparently refreshes the JWT every hour
// off the long-lived refresh token, so a user is only signed out after 60 days
// with no requests (inactiveDurationMs) or 60 days since sign-in
// (totalDurationMs), whichever fires first.
//
// MUST stay in sync with `cookieConfig.maxAge` in `proxy.ts`: cookie expiry has
// to be >= refresh-token expiry, or users get signed out on cookie expiry even
// though the server-side session is still valid.
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
    totalDurationMs: SESSION_DURATION_MS,
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
