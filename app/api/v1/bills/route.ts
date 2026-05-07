import { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  apiError,
  apiOk,
  applyCors,
  authenticateAndLimit,
  clientIp,
  intParam,
  logRequest,
  preflight,
  publicBill,
  statusToStage,
  userAgent,
  withRateLimitHeaders,
} from "../_shared";


const ENDPOINT = "/api/v1/bills";

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  const auth = await authenticateAndLimit(req, ENDPOINT);
  if ("status" in auth) return applyCors(auth);
  const { client } = auth;

  const sp = req.nextUrl.searchParams;
  const limit = intParam(sp.get("limit"), 25, 50);
  const cursor = sp.get("cursor"); // base64url(JSON({offset}))

  let offset = 0;
  if (cursor) {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, "base64url").toString("utf8"),
      ) as { o?: number };
      if (typeof decoded.o === "number" && decoded.o >= 0) {
        offset = Math.min(decoded.o, 500);
      }
    } catch {
      const res = apiError(
        "invalid_request",
        "Invalid cursor.",
        400,
        { docsAnchor: "pagination" },
      );
      return applyCors(res);
    }
  }

  // Status filter — accept human-readable string (?status=introduced) and
  // translate to the internal numeric stage.
  const status = sp.get("status");
  let progressStage: number | undefined;
  if (status) {
    progressStage = statusToStage(status);
    if (progressStage === undefined) {
      const res = apiError(
        "invalid_request",
        `Unknown status '${status}'. See docs for valid values.`,
        400,
        { docsAnchor: "api/bills#status" },
      );
      return applyCors(res);
    }
  }

  // Other filters.
  const congressRaw = sp.get("congress");
  const congress = congressRaw ? Number.parseInt(congressRaw, 10) : undefined;
  if (congressRaw && (!Number.isFinite(congress) || congress! < 1)) {
    return applyCors(
      apiError("invalid_request", "Invalid congress.", 400),
    );
  }
  const sponsorState = sp.get("sponsor_state") ?? undefined;
  const billType = sp.get("bill_type") ?? undefined;
  const policyArea = sp.get("policy_area") ?? undefined;
  const billNumber = sp.get("bill_number") ?? undefined;
  const titleFilter = sp.get("q") ?? undefined;
  const sponsorFilterRaw = sp.get("sponsor");
  const sponsorFilter = sponsorFilterRaw
    ? sponsorFilterRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10)
    : undefined;
  const introducedDateFilter = sp.get("introduced_after") ?? undefined;
  const lastActionDateFilter = sp.get("last_action_after") ?? undefined;

  let result: { data: unknown[]; hasMore: boolean };
  try {
    result = (await client.query(api.bills.list, {
      offset,
      limit,
      ...(congress !== undefined ? { congress } : {}),
      ...(progressStage !== undefined ? { progressStage } : {}),
      ...(sponsorState ? { sponsorState } : {}),
      ...(billType ? { billType } : {}),
      ...(policyArea ? { policyArea } : {}),
      ...(billNumber ? { billNumber } : {}),
      ...(titleFilter ? { titleFilter } : {}),
      ...(sponsorFilter && sponsorFilter.length > 0
        ? { sponsorFilter }
        : {}),
      ...(introducedDateFilter ? { introducedDateFilter } : {}),
      ...(lastActionDateFilter ? { lastActionDateFilter } : {}),
    })) as { data: unknown[]; hasMore: boolean };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed.";
    return applyCors(apiError("invalid_request", message, 400));
  }

  const data = (result.data as Parameters<typeof publicBill>[0][]).map(
    publicBill,
  );
  const nextCursor = result.hasMore
    ? Buffer.from(JSON.stringify({ o: offset + limit })).toString("base64url")
    : null;

  const res = applyCors(
    withRateLimitHeaders(apiOk(data, {
        pagination: { next_cursor: nextCursor, has_more: result.hasMore },
      }), auth.hourlyRemaining, auth.dailyRemaining),
  );
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
