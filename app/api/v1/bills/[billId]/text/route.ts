import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  apiError,
  apiOk,
  applyCors,
  authenticateAndLimit,
  clientIp,
  intParam,
  isValidBillId,
  logRequest,
  preflight,
  userAgent,
  withRateLimitHeaders,
} from "../../../_shared";


export async function OPTIONS() {
  return preflight();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ billId: string }> },
) {
  const { billId } = await params;
  const endpoint = `/api/v1/bills/${billId}/text`;
  if (!isValidBillId(billId)) {
    return applyCors(apiError("invalid_request", "Invalid bill ID.", 400));
  }
  const started = Date.now();
  const auth = await authenticateAndLimit(req, endpoint);
  if ("status" in auth) return applyCors(auth);
  const { client } = auth;

  const limit = intParam(req.nextUrl.searchParams.get("limit"), 25, 200);
  let rows: unknown[];
  try {
    rows = (await client.query(api.bills.listTextPublic, {
      billId,
      limit,
    })) as unknown[];
  } catch {
    return applyCors(
      apiError("internal_error", "Could not fetch text versions.", 500),
    );
  }
  const res = applyCors(withRateLimitHeaders(apiOk(rows), auth.hourlyRemaining, auth.dailyRemaining));
  logRequest(client, {
    bearerToken: auth.bearerToken,
    endpoint,
    method: "GET",
    status: 200,
    latencyMs: Date.now() - started,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });
  return res;
}
