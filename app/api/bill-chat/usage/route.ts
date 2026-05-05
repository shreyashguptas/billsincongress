import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  debugBillChatAuth,
  getConvexClient,
  getOrCreateAnonymousChatSessionId,
  setConvexAuth,
} from "../_shared";

export async function GET() {
  const client = getConvexClient();
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

  const usage = await client.query(api.rateLimits.getChatUsage, {
    anonymousSessionId,
  });
  const result = {
    ...usage,
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
