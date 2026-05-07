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


const ENDPOINT = "/api/v1/congresses";

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  const auth = await authenticateAndLimit(req, ENDPOINT);
  if ("status" in auth) return applyCors(auth);
  const { client } = auth;

  let rows: Array<{
    congress: number;
    totalCount: number;
    houseCount: number;
    senateCount: number;
    stageCounts: Array<{ stage: number; description: string; count: number }>;
    updatedAt: string;
  }>;
  try {
    rows = await client.query(api.bills.getAllCongressOverview);
  } catch {
    return applyCors(
      apiError("internal_error", "Could not fetch congresses.", 500),
    );
  }

  const data = rows.map((r) => ({
    congress: r.congress,
    total_count: r.totalCount,
    house_count: r.houseCount,
    senate_count: r.senateCount,
    stage_counts: r.stageCounts.map((s) => ({
      stage: s.stage,
      description: s.description,
      count: s.count,
    })),
    updated_at: r.updatedAt,
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
