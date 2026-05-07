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
} from "../../../../_shared";


export async function OPTIONS() {
  return preflight();
}

export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ congress: string; chamber: string }>;
  },
) {
  const { congress: cStr, chamber } = await params;
  const congress = Number.parseInt(cStr, 10);
  const endpoint = `/api/v1/congresses/${cStr}/chambers/${chamber}`;
  if (!Number.isFinite(congress) || congress < 1) {
    return applyCors(apiError("invalid_request", "Invalid congress.", 400));
  }
  if (chamber !== "house" && chamber !== "senate") {
    return applyCors(
      apiError(
        "invalid_request",
        "Chamber must be 'house' or 'senate'.",
        400,
      ),
    );
  }
  const started = Date.now();
  const auth = await authenticateAndLimit(req, endpoint);
  if ("status" in auth) return applyCors(auth);
  const { client } = auth;

  let row: {
    chamber: "house" | "senate";
    total: number;
    partyCounts: Record<string, number>;
    partyLawCounts: Record<string, number>;
    stateCounts: Record<string, number>;
    monthly: Array<{ month: string; count: number; becameLaw: number }>;
  };
  try {
    row = await client.query(api.bills.getChamberDeepBreakdown, {
      congress,
      chamber: chamber as "house" | "senate",
    });
  } catch {
    return applyCors(
      apiError("internal_error", "Could not fetch breakdown.", 500),
    );
  }

  const data = {
    congress,
    chamber: row.chamber,
    total: row.total,
    party_counts: row.partyCounts,
    party_law_counts: row.partyLawCounts,
    state_counts: row.stateCounts,
    monthly: row.monthly.map((m) => ({
      month: m.month,
      count: m.count,
      became_law: m.becameLaw,
    })),
  };

  const res = applyCors(withRateLimitHeaders(apiOk(data), auth.hourlyRemaining, auth.dailyRemaining));
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
