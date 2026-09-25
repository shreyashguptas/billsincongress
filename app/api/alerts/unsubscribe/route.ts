import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexHttpClient } from "@/lib/convex-client";
import { captureServerException } from "@/lib/posthog-server";

/**
 * POST /api/alerts/unsubscribe?token=… — stops every bill-alert email for the
 * reader the token was issued to.
 *
 * Two callers: the /alerts/unsubscribe page's button (JSON body), and mail
 * clients honouring the digest's `List-Unsubscribe-Post: One-Click` header
 * (RFC 8058: form body, token in the URL we gave them). There is deliberately
 * no GET: link scanners and prefetchers open every URL in an email, and a GET
 * that unsubscribed would silently turn readers' alerts off.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token");
  if (!token && request.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = (await request.json()) as { token?: unknown };
      if (typeof body.token === "string") token = body.token;
    } catch {
      // fall through to the 400 below
    }
  }
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });

  const client = getConvexHttpClient();
  if (!client) return NextResponse.json({ ok: false }, { status: 503 });

  try {
    const result = await client.mutation(api.alerts.unsubscribeWithToken, { token });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    await captureServerException(error, undefined, { route: "alerts/unsubscribe" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
