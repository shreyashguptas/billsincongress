import { NextResponse } from "next/server";
import { calculateRateLimit } from "@convex-dev/rate-limiter";
import { api } from "@/convex/_generated/api";
import {
  debugBillChatAuth,
  getOrCreateAnonymousChatSessionId,
  setConvexAuth,
} from "../_shared";
import { getConvexHttpClient } from "@/lib/convex-client";
import { captureServerException } from "@/lib/posthog-server";

export async function GET() {
  const client = getConvexHttpClient();
  if (!client) {
    return NextResponse.json(
      {
        kind: "anonymous",
        max: 0,
        blocked: true,
        resetAt: null,
        requiresAuth: true,
      },
      { status: 503 },
    );
  }

  const auth = await setConvexAuth(client, "usage");
  const anonymousSessionId = await getOrCreateAnonymousChatSessionId();

  let usage;
  try {
    usage = await client.query(api.rateLimits.getChatUsage, {
      anonymousSessionId,
    });
  } catch (error) {
    // Report to PostHog Error Tracking, then preserve the original 500 behavior.
    await captureServerException(error, undefined, { route: "bill-chat/usage" });
    throw error;
  }
  const quota = "quota" in usage ? usage.quota : null;
  const currentQuota = quota
    ? calculateRateLimit(
        { value: quota.value, ts: quota.ts },
        quota.config,
        Date.now(),
        0,
      )
    : null;
  const remaining = currentQuota
    ? Math.max(0, Math.min(usage.max, Math.floor(currentQuota.value)))
    : ("remaining" in usage && typeof usage.remaining === "number" ? usage.remaining : usage.max);
  const used =
    "used" in usage && typeof usage.used === "number"
      ? usage.used
      : Math.max(0, usage.max - remaining);
  const result = {
    ...usage,
    quota: undefined,
    remaining,
    used,
    resetAt:
      usage.blocked && typeof usage.retryAfterMs === "number"
        ? Date.now() + usage.retryAfterMs
        : usage.resetAt,
  };
  debugBillChatAuth("usage-result", {
    hadToken: auth.hasToken,
    kind: result.kind,
    blocked: result.blocked,
    max: result.max,
    resetAt: result.resetAt,
    requiresAuth: result.requiresAuth ?? false,
  });

  return NextResponse.json(result);
}
