import { NextRequest, NextResponse } from "next/server";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";


function getClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

/**
 * Issue a re-auth OTP challenge. POST with no body. Returns
 * `{ challengeId, sentTo, expiresAt }` on success. Same-origin / signed in
 * required (Convex enforces both via the session token).
 */
export async function POST() {
  const client = getClient();
  if (!client) {
    return NextResponse.json(
      { error: "Service not available." },
      { status: 503 },
    );
  }
  const session = await convexAuthNextjsToken();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  client.setAuth(session);

  try {
    const result = await client.action(
      api.apiTokenReauth.issueChallenge,
      {},
    );
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not issue challenge.";
    if (message.includes("EMAIL_NOT_VERIFIED")) {
      return NextResponse.json(
        { error: "EMAIL_NOT_VERIFIED" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Verify a code against an issued challenge. PATCH with `{ challengeId, code }`.
 * Returns `{ ok: true, verifiedAt }` on success.
 */
export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }
  const { challengeId, code } = body as {
    challengeId?: unknown;
    code?: unknown;
  };
  if (typeof challengeId !== "string" || typeof code !== "string") {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const client = getClient();
  if (!client) {
    return NextResponse.json(
      { error: "Service not available." },
      { status: 503 },
    );
  }
  const session = await convexAuthNextjsToken();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  client.setAuth(session);

  try {
    const result = await client.mutation(api.apiTokenReauth.verifyChallenge, {
      challengeId: challengeId as unknown as Id<"apiTokenReauthChallenges">,
      code,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not verify code.";
    if (message.includes("INVALID_CODE")) {
      return NextResponse.json({ error: "INVALID_CODE" }, { status: 400 });
    }
    if (message.includes("CHALLENGE_EXPIRED")) {
      return NextResponse.json(
        { error: "CHALLENGE_EXPIRED" },
        { status: 410 },
      );
    }
    if (message.includes("CHALLENGE_LOCKED")) {
      return NextResponse.json(
        { error: "CHALLENGE_LOCKED" },
        { status: 429 },
      );
    }
    if (message.includes("CHALLENGE_NOT_FOUND")) {
      return NextResponse.json(
        { error: "CHALLENGE_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
