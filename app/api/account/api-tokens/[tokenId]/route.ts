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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await params;
  const client = getClient();
  if (!client) {
    return NextResponse.json(
      { error: "Service not available." },
      { status: 503 },
    );
  }
  const sessionToken = await convexAuthNextjsToken();
  if (!sessionToken) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  client.setAuth(sessionToken);
  try {
    const result = await client.mutation(api.apiTokens.revokeToken, {
      tokenId: tokenId as unknown as Id<"apiTokens">,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not revoke token.";
    if (message.includes("NOT_FOUND")) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
