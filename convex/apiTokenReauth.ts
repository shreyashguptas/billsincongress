import { v, ConvexError } from "convex/values";
import {
  mutation,
  internalMutation,
  internalAction,
  action,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireVerifiedUser } from "./users";
import { rateLimiter } from "./rateLimits";
import { sha256Hex } from "./apiTokens";
import { Resend as ResendAPI } from "resend";
import type { Id } from "./_generated/dataModel";

// 6-digit numeric code, 10-minute lifetime, 5 attempts max.
//
// Why OTP instead of password re-prompt? Convex Auth's Password provider
// has no public "verify-only" call, and a free-form password field in the
// UI gets autofilled by browsers anyway — the security gain is illusory.
// Email-OTP proves possession of the account's mailbox, which is a
// stronger guarantee for an "I'm about to mint a long-lived secret" gate.
//
// Google-OAuth users skip this gate entirely (Google itself does the
// strong-auth on sign-in, and we can't email-loop them since they may not
// have access to the address shown in their profile).

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function generateOtp(): string {
  // Web Crypto is available in the Convex runtime.
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 6; i++) out += (buf[i] % 10).toString();
  return out;
}

// ─── Public mutations ──────────────────────────────────────────────────────

/**
 * Issue a re-auth challenge for the current user. Inserts a row with the
 * SHA-256 of a freshly generated 6-digit code and returns the challengeId
 * + email it was sent to. The plaintext code never appears server-side
 * after this call returns.
 *
 * Rate-limited per-user via the existing `apiTokenReauthOtpPerUser`
 * bucket. The library throws on empty so the caller surfaces it.
 */
export const issueChallenge = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    challengeId: Id<"apiTokenReauthChallenges">;
    sentTo: string;
    expiresAt: number;
  }> => {
    const result: {
      challengeId: Id<"apiTokenReauthChallenges">;
      email: string;
      code: string;
      expiresAt: number;
    } = await ctx.runMutation(
      internal.apiTokenReauth._mintChallenge,
      {},
    );

    // Send the email. We do this from an action because Resend's HTTP client
    // is not allowed in mutations. If the send fails we delete the row so
    // the user can retry without a stale challenge sitting around.
    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.apiTokenReauth._deleteChallenge, {
        challengeId: result.challengeId,
      });
      throw new ConvexError("EMAIL_NOT_CONFIGURED");
    }
    const resend = new ResendAPI(apiKey);
    const from =
      process.env.AUTH_EMAIL_FROM ??
      "Bills.Congress <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: [result.email],
      subject: "Your API token verification code",
      text: [
        `Your code is ${result.code}.`,
        "",
        "It expires in 10 minutes.",
        "",
        "You're seeing this because someone — hopefully you — is trying to",
        "create a new API token on your Bills.Congress account.",
        "",
        "If that wasn't you, you can ignore this message. The code expires",
        "automatically and an attacker can't use it without your inbox.",
      ].join("\n"),
    });
    if (error) {
      console.error("Resend re-auth email failed", error);
      await ctx.runMutation(internal.apiTokenReauth._deleteChallenge, {
        challengeId: result.challengeId,
      });
      throw new Error("Could not send verification email.");
    }

    return {
      challengeId: result.challengeId,
      sentTo: result.email,
      expiresAt: result.expiresAt,
    };
  },
});

/**
 * Verify a code against an issued challenge. Marks the challenge
 * `verifiedAt` on success so a subsequent `apiTokens.createToken` call can
 * accept it. Constant-time compare on the hash, attempt counter, expiry
 * gate.
 */
export const verifyChallenge = mutation({
  args: {
    challengeId: v.id("apiTokenReauthChallenges"),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireVerifiedUser(ctx);
    const row = await ctx.db.get(args.challengeId);
    if (!row || row.userId !== user._id) {
      throw new ConvexError("CHALLENGE_NOT_FOUND");
    }
    if (row.verifiedAt) {
      // Already verified — short-circuit so the UI can move on.
      return { ok: true, verifiedAt: row.verifiedAt };
    }
    if (row.expiresAt <= Date.now()) {
      throw new ConvexError("CHALLENGE_EXPIRED");
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      throw new ConvexError("CHALLENGE_LOCKED");
    }

    const trimmed = args.code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
      throw new ConvexError("INVALID_CODE");
    }

    const incomingHash = await sha256Hex(trimmed);
    // Constant-time compare on hex strings of the same length. (`===` would
    // be fine for SHA-256 hex, but we make it explicit.)
    if (!constantTimeEqual(incomingHash, row.codeHash)) {
      await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
      throw new ConvexError("INVALID_CODE");
    }

    const now = Date.now();
    await ctx.db.patch(row._id, { verifiedAt: now });
    return { ok: true, verifiedAt: now };
  },
});

// ─── Internal helpers ──────────────────────────────────────────────────────

export const _mintChallenge = internalMutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireVerifiedUser(ctx);
    if (!user.email) throw new ConvexError("NO_EMAIL");

    // Rate limit per-user. Throws if exceeded.
    await rateLimiter.limit(ctx, "apiTokenReauthOtpPerUser", {
      key: user._id,
      throws: true,
    });

    // Burn any existing un-verified challenges for this user — only one in
    // flight at a time keeps the model simple.
    const existing = await ctx.db
      .query("apiTokenReauthChallenges")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const r of existing) {
      if (!r.verifiedAt) await ctx.db.delete(r._id);
    }

    const code = generateOtp();
    const codeHash = await sha256Hex(code);
    const now = Date.now();
    const expiresAt = now + OTP_LIFETIME_MS;
    const challengeId = await ctx.db.insert("apiTokenReauthChallenges", {
      userId: user._id,
      codeHash,
      createdAt: now,
      expiresAt,
      attempts: 0,
    });

    return { challengeId, email: user.email, code, expiresAt };
  },
});

export const _deleteChallenge = internalMutation({
  args: { challengeId: v.id("apiTokenReauthChallenges") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.challengeId);
    if (row) await ctx.db.delete(args.challengeId);
  },
});

/**
 * Cron-driven cleanup of expired or fully-spent challenges. Runs daily.
 */
export const _pruneExpiredChallenges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("apiTokenReauthChallenges")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .order("asc")
      .take(500);
    for (const row of expired) {
      await ctx.db.delete(row._id);
    }
    return { deleted: expired.length };
  },
});

/** Tiny action wrapper so the cron has something to call. */
export const _pruneExpiredChallengesAction = internalAction({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    const result: { deleted: number } = await ctx.runMutation(
      internal.apiTokenReauth._pruneExpiredChallenges,
      {},
    );
    return result;
  },
});

// ─── Constant-time string compare ──────────────────────────────────────────

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
