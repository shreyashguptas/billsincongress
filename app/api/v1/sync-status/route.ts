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


const ENDPOINT = "/api/v1/sync-status";

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  const auth = await authenticateAndLimit(req, ENDPOINT);
  if ("status" in auth) return applyCors(auth);
  const { client } = auth;

  let row: {
    syncType: string;
    completedAt?: string;
    totalProcessed?: number;
    totalSuccess?: number;
    totalFailed?: number;
  } | null;
  try {
    row = await client.query(api.bills.getSyncStatus);
  } catch {
    return applyCors(
      apiError("internal_error", "Could not fetch sync status.", 500),
    );
  }
  const data = row
    ? {
        sync_type: row.syncType,
        completed_at: row.completedAt ?? null,
        total_processed: row.totalProcessed ?? null,
        total_success: row.totalSuccess ?? null,
        total_failed: row.totalFailed ?? null,
      }
    : null;
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
