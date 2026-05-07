import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  apiError,
  apiOk,
  applyCors,
  authenticateAndLimit,
  clientIp,
  isValidBillId,
  logRequest,
  preflight,
  publicBill,
  userAgent,
  withRateLimitHeaders,
} from "../../_shared";


export async function OPTIONS() {
  return preflight();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ billId: string }> },
) {
  const { billId } = await params;
  const endpoint = `/api/v1/bills/${billId}`;
  if (!isValidBillId(billId)) {
    return applyCors(apiError("invalid_request", "Invalid bill ID.", 400));
  }

  const started = Date.now();
  const auth = await authenticateAndLimit(req, endpoint);
  if ("status" in auth) return applyCors(auth);
  const { client } = auth;

  let bill: Parameters<typeof publicBill>[0] | null;
  try {
    bill = (await client.query(api.bills.getById, {
      billId,
    })) as Parameters<typeof publicBill>[0] | null;
  } catch {
    return applyCors(
      apiError("internal_error", "Could not fetch bill.", 500),
    );
  }
  if (!bill) {
    const res = applyCors(apiError("not_found", "Bill not found.", 404));
    logRequest(client, {
    bearerToken: auth.bearerToken,
      endpoint,
      method: "GET",
      status: 404,
      latencyMs: Date.now() - started,
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    return res;
  }

  const res = applyCors(
    withRateLimitHeaders(apiOk(publicBill(bill)), auth.hourlyRemaining, auth.dailyRemaining),
  );
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
