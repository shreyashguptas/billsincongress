import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  getConvexClient,
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

  await setConvexAuth(client);

  const result = await client.query(api.rateLimits.getChatUsage, {});

  return NextResponse.json(result);
}
