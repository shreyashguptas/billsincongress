import { NextRequest, NextResponse } from "next/server";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";


const MAX_NAME_LEN = 80;
const VALID_EXPIRY = ["30d", "90d", "1y", "never"] as const;
type Expiry = (typeof VALID_EXPIRY)[number];

function getClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Mint a new API token. Same-origin only — gated by the Convex Auth session
 * cookie, so cross-origin attackers can't mint tokens for the user even if
 * they're signed in elsewhere.
 *
 * Body shape:
 *   { name: string; expiry: "30d"|"90d"|"1y"|"never";
 *     reauthChallengeId?: Id<"apiTokenReauthChallenges"> }
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }
  const { name, expiry, reauthChallengeId } = body as {
    name?: unknown;
    expiry?: unknown;
    reauthChallengeId?: unknown;
  };
  if (typeof name !== "string" || name.trim().length === 0) {
    return bad("Name is required.");
  }
  if (name.length > MAX_NAME_LEN) {
    return bad(`Name must be ${MAX_NAME_LEN} characters or fewer.`);
  }
  if (typeof expiry !== "string" || !VALID_EXPIRY.includes(expiry as Expiry)) {
    return bad("Invalid expiry.");
  }
  if (
    reauthChallengeId !== undefined &&
    (typeof reauthChallengeId !== "string" || reauthChallengeId.length > 200)
  ) {
    return bad("Invalid reauthChallengeId.");
  }

  const client = getClient();
  if (!client) return bad("Service not available.", 503);
  const token = await convexAuthNextjsToken();
  if (!token) return bad("Not signed in.", 401);
  client.setAuth(token);

  try {
    const result = await client.mutation(api.apiTokens.createToken, {
      name: name.trim(),
      expiry: expiry as Expiry,
      ...(typeof reauthChallengeId === "string"
        ? {
            reauthChallengeId:
              reauthChallengeId as unknown as Id<"apiTokenReauthChallenges">,
          }
        : {}),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create token.";
    // Map known ConvexError codes to status codes the UI can branch on.
    if (message.includes("REAUTH_REQUIRED")) {
      return NextResponse.json({ error: "REAUTH_REQUIRED" }, { status: 403 });
    }
    if (message.includes("EMAIL_NOT_VERIFIED")) {
      return NextResponse.json(
        { error: "EMAIL_NOT_VERIFIED" },
        { status: 403 },
      );
    }
    if (message.includes("TOKEN_LIMIT")) {
      return NextResponse.json({ error: "TOKEN_LIMIT" }, { status: 409 });
    }
    if (message.includes("NAME_TOO_LONG") || message.includes("INVALID_NAME")) {
      return bad("Invalid name.");
    }
    return bad(message, 500);
  }
}
