import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  type ChatGateway,
  buildGateway,
  getConvexClient,
  getOrCreateAnonCookie,
  setConvexAuth,
  withAnonCookie,
} from "../_shared";

export async function GET(request: NextRequest) {
  const client = getConvexClient();
  if (!client) {
    return NextResponse.json(
      {
        kind: "anonymous",
        max: 5,
        blocked: false,
        resetAt: null,
      },
      { status: 503 },
    );
  }

  const { value: anonCookie, shouldSet } = getOrCreateAnonCookie(request);
  let gateway: ChatGateway;
  try {
    gateway = buildGateway(request, anonCookie);
  } catch {
    return NextResponse.json(
      {
        kind: "anonymous",
        max: 5,
        blocked: true,
        resetAt: null,
      },
      { status: 500 },
    );
  }

  await setConvexAuth(client);

  const result = await client.query(api.rateLimits.getChatUsage, {
    gateway,
  });

  return withAnonCookie(NextResponse.json(result), anonCookie, shouldSet);
}
