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
} from "../../_shared";


export async function OPTIONS() {
  return preflight();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ congress: string }> },
) {
  const { congress: congressStr } = await params;
  const congress = Number.parseInt(congressStr, 10);
  const endpoint = `/api/v1/congresses/${congressStr}`;
  if (!Number.isFinite(congress) || congress < 1 || congress > 999) {
    return applyCors(apiError("invalid_request", "Invalid congress.", 400));
  }
  const started = Date.now();
  const auth = await authenticateAndLimit(req, endpoint);
  if ("status" in auth) return applyCors(auth);
  const { client } = auth;

  let dashboard: {
    congress: number;
    totalBills: number;
    houseCount: number;
    senateCount: number;
    statusBreakdown: Record<string, number>;
    topSponsors: Array<{
      name: string;
      count: number;
      party?: string;
      state?: string;
    }>;
    topPolicyAreas: Array<{ name: string; count: number }>;
  } | null;
  try {
    dashboard = await client.query(api.bills.getCongressDashboard, {
      congress,
    });
  } catch {
    return applyCors(
      apiError("internal_error", "Could not fetch dashboard.", 500),
    );
  }
  if (!dashboard) {
    const res = applyCors(
      apiError("not_found", "Congress not found.", 404),
    );
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

  const data = {
    congress: dashboard.congress,
    total_bills: dashboard.totalBills,
    house_count: dashboard.houseCount,
    senate_count: dashboard.senateCount,
    status_breakdown: dashboard.statusBreakdown,
    top_sponsors: dashboard.topSponsors.map((s) => ({
      name: s.name,
      count: s.count,
      party: s.party ?? null,
      state: s.state ?? null,
    })),
    top_policy_areas: dashboard.topPolicyAreas,
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
