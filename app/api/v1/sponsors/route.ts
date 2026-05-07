import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  apiError,
  apiOk,
  applyCors,
  authenticateAndLimit,
  clientIp,
  logRequest,
  preflight,
  userAgent,
  withRateLimitHeaders,
} from "../_shared";


const ENDPOINT = "/api/v1/sponsors";

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  const auth = await authenticateAndLimit(req, ENDPOINT);
  if ("status" in auth) return applyCors(auth);
  const { client } = auth;

  let rows: Array<{
    name: string;
    party?: string;
    state?: string;
    billCount: number;
  }>;
  try {
    rows = await client.query(api.bills.listAllSponsors);
  } catch {
    return applyCors(
      apiError("internal_error", "Could not fetch sponsors.", 500),
    );
  }
  const data = rows.map((s) => ({
    name: s.name,
    party: s.party ?? null,
    state: s.state ?? null,
    bill_count: s.billCount,
  }));
  const res = applyCors(withRateLimitHeaders(apiOk(data), auth.hourlyRemaining, auth.dailyRemaining));
  logRequest(client, {
    bearerToken: auth.bearerToken,
    endpoint: ENDPOINT,
    method: "GET",
    status: 200,
    latencyMs: Date.now() - started,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });
  return res;
}
