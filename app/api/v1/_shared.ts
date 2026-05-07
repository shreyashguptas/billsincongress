import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// ─── Constants ─────────────────────────────────────────────────────────────

export const TOKEN_PREFIX_LIVE = "bic_live_";

// Mirrored from convex/rateLimits.ts so the response headers and the
// rate-limit gate use the same numbers. If you change them in Convex,
// change them here.
export const API_TOKEN_HOURLY_LIMIT = 1000;
export const API_TOKEN_DAILY_LIMIT = 10000;
export const API_IP_PER_MINUTE_LIMIT = 100;

const DOCS_BASE = "https://billsincongress.com/docs";

// ─── Convex client ─────────────────────────────────────────────────────────

/**
 * Returns a fresh ConvexHttpClient. We deliberately do NOT call setAuth
 * here — the public API authenticates by header, not by session JWT, and
 * the two flows must stay separate so a leaked API token can never escalate
 * to a full user session.
 */
export function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

// ─── Error shape ───────────────────────────────────────────────────────────

export type ApiErrorType =
  | "missing_token"
  | "invalid_token"
  | "expired_token"
  | "revoked_token"
  | "rate_limit_exceeded"
  | "ip_rate_limit_exceeded"
  | "invalid_request"
  | "not_found"
  | "method_not_allowed"
  | "service_unavailable"
  | "internal_error";

interface ErrorOptions {
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;
  docsAnchor?: string;
}

export function apiError(
  type: ApiErrorType,
  message: string,
  status: number,
  options: ErrorOptions = {},
): NextResponse {
  const docsUrl = options.docsAnchor
    ? `${DOCS_BASE}/${options.docsAnchor}`
    : `${DOCS_BASE}/errors#${type}`;
  const body: Record<string, unknown> = {
    error: {
      type,
      message,
      docs_url: docsUrl,
    },
    meta: { request_id: requestId() },
  };
  if (options.retryAfterSeconds !== undefined) {
    (body.error as Record<string, unknown>).retry_after_seconds =
      options.retryAfterSeconds;
  }
  if (options.details) {
    (body.error as Record<string, unknown>).details = options.details;
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (options.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(options.retryAfterSeconds);
  }
  return NextResponse.json(body, { status, headers });
}

export function apiOk<T>(
  data: T,
  init: {
    status?: number;
    headers?: Record<string, string>;
    pagination?: {
      next_cursor: string | null;
      has_more: boolean;
    };
    meta?: Record<string, unknown>;
  } = {},
): NextResponse {
  const body: Record<string, unknown> = {
    data,
    meta: {
      request_id: requestId(),
      ...(init.meta ?? {}),
    },
  };
  if (init.pagination) body.pagination = init.pagination;
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, max-age=0, must-revalidate",
      ...(init.headers ?? {}),
    },
  });
}

function requestId(): string {
  // 16 random bytes → 32 hex chars, prefixed for grep-ability in logs.
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let hex = "";
  for (let i = 0; i < buf.length; i++) {
    hex += buf[i].toString(16).padStart(2, "0");
  }
  return `req_${hex}`;
}

// ─── CORS ──────────────────────────────────────────────────────────────────
//
// Wide-open CORS is intentional here. Every endpoint is read-only public
// data; cross-origin browser use is a feature. We do NOT send
// `Access-Control-Allow-Credentials: true` because the API authenticates
// by header, not by cookie — there's no credential to share.

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export function applyCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders())) res.headers.set(k, v);
  return res;
}

// ─── Auth + rate limit middleware ──────────────────────────────────────────

export interface AuthContext {
  client: ConvexHttpClient;
  bearerToken: string;
  tokenId: Id<"apiTokens">;
  userId: Id<"users">;
  plan: "free" | "pro";
  scopes: ReadonlyArray<string>;
  hourlyRemaining: number;
  dailyRemaining: number;
}

/**
 * Per-request middleware. Returns either an authed `AuthContext` or a
 * `NextResponse` that the caller should return verbatim. Order:
 *   1. Reject token in query string (would be logged; URL-borne secrets
 *      are an explicit no).
 *   2. Per-IP rate limit (1 mutation, not per-token; cheap reject).
 *   3. Parse Authorization header.
 *   4. Reject obvious shape problems before DB lookup.
 *   5. Look up the token in Convex by hash.
 *   6. Per-token hourly + daily rate limit.
 */
export async function authenticateAndLimit(
  req: NextRequest,
  endpoint: string,
): Promise<AuthContext | NextResponse> {
  // 1. URL-borne secrets are rejected. We scan ALL query parameter values
  // (not just `?token=...`) because any string starting with `bic_live_` is
  // a credential, regardless of which key it was passed under. URL params
  // get logged everywhere — server access logs, browser history, CDN logs,
  // Referer headers — so we treat their presence as user error and refuse
  // to process the request.
  for (const [key, value] of req.nextUrl.searchParams.entries()) {
    if (
      value.startsWith(TOKEN_PREFIX_LIVE) ||
      key === "token" ||
      key === "api_key" ||
      key === "access_token"
    ) {
      return apiError(
        "invalid_request",
        "Tokens must be sent in the Authorization header, not in the URL.",
        400,
        { docsAnchor: "authentication" },
      );
    }
  }

  const client = getConvexClient();
  if (!client) {
    return apiError(
      "service_unavailable",
      "API service is not currently available.",
      503,
    );
  }

  // 2. Per-IP rate limit (best-effort — we still serve if it fails open).
  const ip = clientIp(req);
  if (ip) {
    try {
      const status = await client.mutation(api.rateLimits.consumeApiIp, {
        ip,
      });
      if (!status.ok) {
        const retryAfter = Math.max(
          1,
          Math.ceil((status.retryAfterMs ?? 60_000) / 1000),
        );
        return apiError(
          "ip_rate_limit_exceeded",
          `Too many requests from your IP. Limit is ${API_IP_PER_MINUTE_LIMIT}/minute.`,
          429,
          { retryAfterSeconds: retryAfter, docsAnchor: "rate-limits" },
        );
      }
    } catch {
      // Convex unreachable; downstream calls will fail and return 503.
    }
  }

  // 3 + 4. Authorization header.
  const header = req.headers.get("authorization");
  if (!header) {
    return apiError(
      "missing_token",
      "Authorization header is required. Send it as 'Authorization: Bearer bic_live_...'.",
      401,
      { docsAnchor: "authentication" },
    );
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) {
    return apiError(
      "invalid_token",
      "Authorization header must use the Bearer scheme.",
      401,
      { docsAnchor: "authentication" },
    );
  }
  const bearer = match[1];
  if (!bearer.startsWith(TOKEN_PREFIX_LIVE)) {
    return apiError(
      "invalid_token",
      "Token has an unrecognized prefix.",
      401,
      { docsAnchor: "authentication" },
    );
  }
  if (bearer.length < TOKEN_PREFIX_LIVE.length + 16) {
    return apiError(
      "invalid_token",
      "Token is malformed.",
      401,
      { docsAnchor: "authentication" },
    );
  }

  // 5. Look up token in Convex.
  let auth: {
    tokenId: Id<"apiTokens">;
    userId: Id<"users">;
    plan: "free" | "pro";
    scopes: readonly string[];
  } | null;
  try {
    auth = await client.query(api.apiTokens.authenticateBearer, {
      bearerToken: bearer,
    });
  } catch {
    return apiError(
      "service_unavailable",
      "Could not verify token right now. Please retry.",
      503,
    );
  }
  if (!auth) {
    return apiError(
      "invalid_token",
      "Token is invalid, revoked, or expired.",
      401,
      { docsAnchor: "authentication" },
    );
  }

  // 6. Per-token rate limits — sequenced so a request that's already been
  // rate-limited at the hourly gate doesn't burn a daily token too. This
  // is a token-bucket on hourly + fixed-window on daily; the worst-case
  // serialization cost is one extra Convex round-trip on a quota miss.
  let hourly: { ok: boolean; remaining: number; retryAfterMs?: number };
  try {
    hourly = await client.mutation(api.rateLimits.consumeApiTokenHourly, {
      tokenId: auth.tokenId,
    });
  } catch {
    return apiError(
      "service_unavailable",
      "Could not check rate limit right now. Please retry.",
      503,
    );
  }
  if (!hourly.ok) {
    const retryAfter = Math.max(
      1,
      Math.ceil((hourly.retryAfterMs ?? 60_000) / 1000),
    );
    return apiError(
      "rate_limit_exceeded",
      `You've exceeded your hourly request limit (${API_TOKEN_HOURLY_LIMIT}/hour).`,
      429,
      {
        retryAfterSeconds: retryAfter,
        docsAnchor: "rate-limits",
        details: { which: "hourly", limit: `${API_TOKEN_HOURLY_LIMIT}/hour` },
      },
    );
  }

  let daily: { ok: boolean; remaining: number; retryAfterMs?: number };
  try {
    daily = await client.mutation(api.rateLimits.consumeApiTokenDaily, {
      tokenId: auth.tokenId,
    });
  } catch {
    return apiError(
      "service_unavailable",
      "Could not check rate limit right now. Please retry.",
      503,
    );
  }
  if (!daily.ok) {
    const retryAfter = Math.max(
      1,
      Math.ceil((daily.retryAfterMs ?? 60_000) / 1000),
    );
    return apiError(
      "rate_limit_exceeded",
      `You've exceeded your daily request limit (${API_TOKEN_DAILY_LIMIT}/day).`,
      429,
      {
        retryAfterSeconds: retryAfter,
        docsAnchor: "rate-limits",
        details: { which: "daily", limit: `${API_TOKEN_DAILY_LIMIT}/day` },
      },
    );
  }

  return {
    client,
    bearerToken: bearer,
    tokenId: auth.tokenId,
    userId: auth.userId,
    plan: auth.plan,
    scopes: auth.scopes,
    hourlyRemaining: hourly.remaining,
    dailyRemaining: daily.remaining,
  };
}

/**
 * Best-effort log of one request. Fire-and-forget — we do not await this
 * before returning the response to the user. A failure here must never
 * delay or fail a successful API call.
 */
export function logRequest(
  client: ConvexHttpClient,
  args: {
    bearerToken: string;
    endpoint: string;
    method: string;
    status: number;
    latencyMs: number;
    ip?: string;
    userAgent?: string;
  },
): void {
  void client
    .mutation(api.apiTokens.recordRequest, args)
    .catch(() => {
      /* swallow — observability is not on the hot path */
    });
}

/**
 * Add the X-RateLimit-* headers to a response. Called for every successful
 * authed response.
 */
export function withRateLimitHeaders(
  res: NextResponse,
  hourlyRemaining: number,
  dailyRemaining: number,
): NextResponse {
  res.headers.set("X-RateLimit-Limit-Hour", String(API_TOKEN_HOURLY_LIMIT));
  res.headers.set(
    "X-RateLimit-Remaining-Hour",
    String(Math.max(0, hourlyRemaining)),
  );
  res.headers.set("X-RateLimit-Limit-Day", String(API_TOKEN_DAILY_LIMIT));
  res.headers.set(
    "X-RateLimit-Remaining-Day",
    String(Math.max(0, dailyRemaining)),
  );
  return res;
}

// ─── Misc helpers ──────────────────────────────────────────────────────────

export function clientIp(req: NextRequest): string | undefined {
  // Vercel sets `x-forwarded-for`. Take the first hop only.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return undefined;
}

export function userAgent(req: NextRequest): string | undefined {
  return req.headers.get("user-agent") ?? undefined;
}

/** Parse positive integer query param with a default and a max. */
export function intParam(
  raw: string | null,
  fallback: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** Validate a composite billId (e.g. "1234hr119"). Lowercase letters, digits, ≤ 80 chars. */
export function isValidBillId(s: string): boolean {
  return /^[0-9]+[a-z]+[0-9]+$/.test(s) && s.length <= 80;
}

// ─── Status filter ─────────────────────────────────────────────────────────
//
// User-facing API exposes status by human string ("introduced") rather than
// the internal numeric stage (20). Keeps the URL readable and the filter
// stable across schema renames.

export const STATUS_NAME_TO_STAGE: Record<string, number> = {
  introduced: 20,
  in_committee: 40,
  passed_one_chamber: 60,
  passed_both_chambers: 80,
  vetoed: 85,
  to_president: 90,
  signed: 95,
  became_law: 100,
};

export function statusToStage(status: string | null): number | undefined {
  if (!status) return undefined;
  return STATUS_NAME_TO_STAGE[status];
}

// ─── Bill response shape ───────────────────────────────────────────────────
//
// Convex stores camelCase. The public API serves snake_case so the field
// names look correct in Python / Ruby / Go / etc., not just in JavaScript.
// Translation happens here, in one place, so internal renames don't break
// customers.

interface ConvexBill {
  billId: string;
  congress: number;
  billType: string;
  billNumber: string;
  billTypeLabel: string;
  title: string;
  titleWithoutNumber?: string;
  introducedDate: string;
  sponsorFirstName?: string;
  sponsorLastName?: string;
  sponsorParty?: string;
  sponsorState?: string;
  progressStage?: number;
  progressDescription?: string;
  latestActionDate?: string;
  updatedAt: string;
  bill_subjects?: { policy_area_name: string };
  latest_summary?: string;
  pdf_url?: string;
}

const STAGE_TO_STATUS: Record<number, string> = Object.fromEntries(
  Object.entries(STATUS_NAME_TO_STAGE).map(([k, v]) => [v, k]),
);

export function publicBill(bill: ConvexBill): Record<string, unknown> {
  const stage = bill.progressStage ?? 20;
  return {
    bill_id: bill.billId,
    congress: bill.congress,
    bill_type: bill.billType,
    bill_number: bill.billNumber,
    bill_type_label: bill.billTypeLabel,
    title: bill.title,
    title_without_number: bill.titleWithoutNumber ?? null,
    introduced_date: bill.introducedDate,
    latest_action_date: bill.latestActionDate ?? null,
    status: STAGE_TO_STATUS[stage] ?? "introduced",
    status_stage: stage,
    status_description: bill.progressDescription ?? null,
    sponsor: {
      first_name: bill.sponsorFirstName ?? null,
      last_name: bill.sponsorLastName ?? null,
      party: bill.sponsorParty ?? null,
      state: bill.sponsorState ?? null,
    },
    policy_area: bill.bill_subjects?.policy_area_name ?? null,
    latest_summary: bill.latest_summary ?? null,
    pdf_url: bill.pdf_url ?? null,
    updated_at: bill.updatedAt,
  };
}
