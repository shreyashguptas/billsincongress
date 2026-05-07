import { v, ConvexError } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalAction,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireUser, requireVerifiedUser } from "./users";
import {
  rateLimiter,
  API_TOKEN_HOURLY_LIMIT,
  API_TOKEN_DAILY_LIMIT,
} from "./rateLimits";
import type { Id } from "./_generated/dataModel";

// ─── Constants ─────────────────────────────────────────────────────────────

export const TOKEN_PREFIX_LIVE = "bic_live_";
// Reserved for future sandbox tokens. Not minted by anything today.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TOKEN_PREFIX_TEST = "bic_test_";

const TOKEN_RANDOM_BYTES = 24; // base64url → 32 chars → ~190 bits entropy
const MAX_TOKEN_NAME_LEN = 80;
const MAX_TOKENS_PER_USER = 10;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Throttle the lastUsedAt patch so an active token doesn't write 1000×/hr.
const LAST_USED_PATCH_THROTTLE_MS = 60 * 1000;

const DEFAULT_SCOPES: ReadonlyArray<string> = ["read"];

// ─── Helpers (not registered) ──────────────────────────────────────────────

/**
 * SHA-256 hex digest of the input string. We compare and look up by hash so
 * the plaintext token never appears in storage. The Convex runtime exposes
 * Web Crypto, including the async `subtle.digest`.
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function randomTokenSecret(): string {
  const bytes = new Uint8Array(TOKEN_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  // base64url alphabet, no padding — URL-safe and clipboard-safe.
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function expiryFromChoice(
  choice: "30d" | "90d" | "1y" | "never",
  nowMs: number,
): number | undefined {
  switch (choice) {
    case "30d":
      return nowMs + THIRTY_DAYS_MS;
    case "90d":
      return nowMs + NINETY_DAYS_MS;
    case "1y":
      return nowMs + ONE_YEAR_MS;
    case "never":
      return undefined;
  }
}

/**
 * Server-side authentication: hash the bearer token, look it up, and verify
 * it's active. Returns { tokenId, userId, plan } or null. Used by the public
 * REST API layer (Next.js route handlers).
 */
export async function authenticateBearerToken(
  ctx: QueryCtx,
  bearerToken: string,
): Promise<{
  tokenId: Id<"apiTokens">;
  userId: Id<"users">;
  plan: "free" | "pro";
  scopes: ReadonlyArray<string>;
} | null> {
  if (!bearerToken.startsWith(TOKEN_PREFIX_LIVE)) return null;
  const hash = await sha256Hex(bearerToken);

  const row = await ctx.db
    .query("apiTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash))
    .unique();
  if (!row) return null;
  if (row.revokedAt) return null;
  const now = Date.now();
  if (row.expiresAt !== undefined && row.expiresAt <= now) return null;

  const user = await ctx.db.get(row.userId);
  if (!user) return null;

  const plan = user.plan === "pro" ? "pro" : "free";
  return {
    tokenId: row._id,
    userId: row.userId,
    plan,
    scopes: row.scopes,
  };
}

// ─── Public queries ────────────────────────────────────────────────────────

/**
 * List the caller's API tokens (active first, then revoked / expired). Never
 * exposes the hash or any data that could be used to forge a token.
 */
export const listMyTokens = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const rows = await ctx.db
      .query("apiTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    const now = Date.now();
    return rows.map((r) => ({
      tokenId: r._id,
      name: r.name,
      tokenLast4: r.tokenLast4,
      scopes: r.scopes,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt ?? null,
      expiresAt: r.expiresAt ?? null,
      revokedAt: r.revokedAt ?? null,
      isExpired: r.expiresAt !== undefined && r.expiresAt <= now,
      isActive:
        r.revokedAt === undefined &&
        (r.expiresAt === undefined || r.expiresAt > now),
    }));
  },
});

/**
 * Quota status for the caller across all active tokens. Drives the API
 * usage card on /account. We return "most used" remaining of any active
 * token rather than try to sum, because each token has its own bucket.
 */
export const getMyApiUsage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        signedIn: false,
        hourlyLimit: API_TOKEN_HOURLY_LIMIT,
        dailyLimit: API_TOKEN_DAILY_LIMIT,
        tokens: [] as Array<{
          tokenId: Id<"apiTokens">;
          name: string;
          hourlyRemaining: number;
          dailyRemaining: number;
          hourlyLimit: number;
          dailyLimit: number;
        }>,
      };
    }

    const rows = await ctx.db
      .query("apiTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    const now = Date.now();
    const activeTokens = rows.filter(
      (r) =>
        r.revokedAt === undefined &&
        (r.expiresAt === undefined || r.expiresAt > now),
    );

    const tokens = await Promise.all(
      activeTokens.map(async (r) => {
        const [hourly, daily] = await Promise.all([
          rateLimiter.getValue(ctx, "apiTokenPerHour", { key: r._id }),
          rateLimiter.getValue(ctx, "apiTokenPerDay", { key: r._id }),
        ]);
        return {
          tokenId: r._id,
          name: r.name,
          hourlyRemaining: Math.max(0, Math.floor(hourly.value)),
          dailyRemaining: Math.max(0, Math.floor(daily.value)),
          hourlyLimit: API_TOKEN_HOURLY_LIMIT,
          dailyLimit: API_TOKEN_DAILY_LIMIT,
        };
      }),
    );

    return {
      signedIn: true,
      hourlyLimit: API_TOKEN_HOURLY_LIMIT,
      dailyLimit: API_TOKEN_DAILY_LIMIT,
      tokens,
    };
  },
});

// ─── Public mutations ──────────────────────────────────────────────────────

/**
 * Create a new API token. Requires:
 *  - Signed in (UNAUTHENTICATED otherwise)
 *  - Email verified (EMAIL_NOT_VERIFIED otherwise)
 *  - Email-OTP re-auth challenge verified within the last 10 minutes for
 *    password-auth users (REAUTH_REQUIRED otherwise; Google-OAuth users
 *    skip this gate per the security plan)
 *  - Fewer than MAX_TOKENS_PER_USER active tokens (TOKEN_LIMIT otherwise)
 *
 * Returns the plaintext token in the response — this is the ONLY time it
 * leaves the server. The hash + last 4 chars are persisted; if the user
 * loses the plaintext, they create a new one and revoke the old.
 */
export const createToken = mutation({
  args: {
    name: v.string(),
    expiry: v.union(
      v.literal("30d"),
      v.literal("90d"),
      v.literal("1y"),
      v.literal("never"),
    ),
    // For password-auth users, the challengeId from a verified
    // apiTokenReauth.verifyChallenge call. Optional for Google-OAuth users
    // (we detect via authAccounts).
    reauthChallengeId: v.optional(v.id("apiTokenReauthChallenges")),
  },
  handler: async (ctx, args): Promise<{
    tokenId: Id<"apiTokens">;
    plaintextToken: string;
    name: string;
    last4: string;
    createdAt: number;
    expiresAt: number | null;
  }> => {
    const user = await requireVerifiedUser(ctx);

    // Validate name.
    const name = args.name.trim();
    if (name.length === 0) throw new ConvexError("INVALID_NAME");
    if (name.length > MAX_TOKEN_NAME_LEN) {
      throw new ConvexError("NAME_TOO_LONG");
    }

    // Re-auth gate. We require an OTP-verified challenge for password-auth
    // users; Google-OAuth users skip it (Google itself does the strong-auth).
    const hasPasswordProvider = await userHasPasswordProvider(ctx, user._id);
    if (hasPasswordProvider) {
      if (!args.reauthChallengeId) throw new ConvexError("REAUTH_REQUIRED");
      const challenge = await ctx.db.get(args.reauthChallengeId);
      if (!challenge) throw new ConvexError("REAUTH_REQUIRED");
      if (challenge.userId !== user._id) {
        throw new ConvexError("REAUTH_REQUIRED");
      }
      if (!challenge.verifiedAt) throw new ConvexError("REAUTH_REQUIRED");
      const reauthMaxAge = 10 * 60 * 1000; // 10 minutes after verify
      if (Date.now() - challenge.verifiedAt > reauthMaxAge) {
        throw new ConvexError("REAUTH_REQUIRED");
      }
    }

    // Cap active tokens.
    const existing = await ctx.db
      .query("apiTokens")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const now = Date.now();
    const active = existing.filter(
      (r) =>
        r.revokedAt === undefined &&
        (r.expiresAt === undefined || r.expiresAt > now),
    );
    if (active.length >= MAX_TOKENS_PER_USER) {
      throw new ConvexError("TOKEN_LIMIT");
    }

    // Mint and store. Hash before insert; plaintext returned to caller.
    const secret = randomTokenSecret();
    const plaintext = `${TOKEN_PREFIX_LIVE}${secret}`;
    const tokenHash = await sha256Hex(plaintext);
    const last4 = plaintext.slice(-4);
    const expiresAt = expiryFromChoice(args.expiry, now);

    const tokenId = await ctx.db.insert("apiTokens", {
      userId: user._id,
      name,
      tokenHash,
      tokenPrefix: TOKEN_PREFIX_LIVE,
      tokenLast4: last4,
      scopes: [...DEFAULT_SCOPES],
      createdAt: now,
      expiresAt,
    });

    // Audit log.
    await ctx.db.insert("usageEvents", {
      userId: user._id,
      kind: "api_token_created",
      createdAt: now,
      metadata: { tokenId, name, expiry: args.expiry },
    });

    // Burn the re-auth challenge so it can't be reused.
    if (args.reauthChallengeId) {
      await ctx.db.delete(args.reauthChallengeId);
    }

    return {
      tokenId,
      plaintextToken: plaintext,
      name,
      last4,
      createdAt: now,
      expiresAt: expiresAt ?? null,
    };
  },
});

/**
 * Revoke a token. Owner-only. Soft delete — the row stays for audit.
 */
export const revokeToken = mutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(args.tokenId);
    if (!row || row.userId !== user._id) {
      throw new ConvexError("NOT_FOUND");
    }
    if (row.revokedAt) return { ok: true, alreadyRevoked: true };
    const now = Date.now();
    await ctx.db.patch(args.tokenId, { revokedAt: now });
    await ctx.db.insert("usageEvents", {
      userId: user._id,
      kind: "api_token_revoked",
      createdAt: now,
      metadata: { tokenId: args.tokenId },
    });
    return { ok: true, alreadyRevoked: false };
  },
});

// ─── Public queries / mutations (called by /api/v1 Next.js routes) ─────────
//
// Exposed publicly because `ConvexHttpClient.query/mutation` only accepts
// public refs. The exposure is deliberately safe:
//   - `authenticateBearer` requires the plaintext token in the args. Anyone
//     who has it could already use it against the API; this exposes nothing
//     more.
//   - `recordRequest` requires the bearer token to re-validate before
//     writing a log row. An attacker without a valid token can't spam logs
//     for someone else's token.

/**
 * Authenticate a bearer token from the public API path. Returning null
 * lets the caller emit a 401 without leaking which step failed (missing
 * prefix, no row, revoked, expired).
 */
export const authenticateBearer = query({
  args: { bearerToken: v.string() },
  handler: async (ctx, args) => {
    return await authenticateBearerToken(ctx, args.bearerToken);
  },
});

/**
 * Throttled patch to lastUsedAt + always-on log insert. Re-validates the
 * bearer token before writing — so the public exposure does not let a
 * stranger pollute another user's log.
 */
export const recordRequest = mutation({
  args: {
    bearerToken: v.string(),
    endpoint: v.string(),
    method: v.string(),
    status: v.number(),
    latencyMs: v.number(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await authenticateBearerToken(ctx, args.bearerToken);
    if (!auth) return; // Nothing to log; the request was already rejected.
    const now = Date.now();

    // Throttled lastUsedAt: skip the patch if we just patched within the
    // throttle window. Avoids contention on a single hot row.
    const token = await ctx.db.get(auth.tokenId);
    if (token) {
      const last = token.lastUsedAt ?? 0;
      if (now - last >= LAST_USED_PATCH_THROTTLE_MS) {
        await ctx.db.patch(auth.tokenId, { lastUsedAt: now });
      }
    }

    await ctx.db.insert("apiRequestLogs", {
      tokenId: auth.tokenId,
      userId: auth.userId,
      endpoint: args.endpoint,
      method: args.method,
      status: args.status,
      latencyMs: args.latencyMs,
      ip: args.ip,
      userAgent: args.userAgent,
      createdAt: now,
    });
  },
});

/**
 * Daily cron: prune apiRequestLogs older than 90 days. Page-paginates so
 * we don't exceed Convex's per-mutation document limit on a backlog.
 */
export const pruneOldLogs = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - NINETY_DAYS_MS;
    const batch = Math.max(1, Math.min(args.batchSize ?? 500, 2000));
    const old = await ctx.db
      .query("apiRequestLogs")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .order("asc")
      .take(batch);
    for (const row of old) {
      await ctx.db.delete(row._id);
    }
    return { deleted: old.length, hasMore: old.length === batch };
  },
});

/**
 * Internal action wrapper around `pruneOldLogs` so the cron can keep
 * pulling batches until empty. Convex mutations have hard read/write
 * caps, so we loop in the action.
 */
export const _pruneOldLogsLoop = internalAction({
  args: {},
  handler: async (ctx): Promise<{ totalDeleted: number }> => {
    let total = 0;
    for (let i = 0; i < 50; i++) {
      const { deleted, hasMore }: { deleted: number; hasMore: boolean } =
        await ctx.runMutation(internal.apiTokens.pruneOldLogs, {});
      total += deleted;
      if (!hasMore) break;
    }
    return { totalDeleted: total };
  },
});

// ─── Auth-account helpers ──────────────────────────────────────────────────

/**
 * True if the user has a password-provider auth account. Used to decide
 * whether the email-OTP re-auth gate applies (Google-OAuth users skip it).
 *
 * `authAccounts` has no by-user index in the upstream library schema, so
 * we scan a bounded slice. Acceptable here — this only runs at token-mint
 * time, not on every API request.
 */
async function userHasPasswordProvider(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const accounts = await ctx.db.query("authAccounts").take(2000);
  return accounts.some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a) =>
      (a as any).provider === "password" && (a as any).userId === userId,
  );
}
