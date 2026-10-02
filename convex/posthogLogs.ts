/**
 * Server log lines to PostHog Logs, sent by our own code.
 *
 * Convex can stream every log to PostHog by itself, but only on its
 * Professional plan. We are on pay-as-you-go, so the few lines worth keeping
 * are sent from here instead, as OpenTelemetry (OTLP/HTTP JSON) — the only
 * format PostHog Logs accepts. See "PostHog Logs" in Documentation/ANALYTICS.md
 * for every line we send and what is on it.
 *
 * A line that carries the reader's `sessionId` and `posthogDistinctId` (the
 * attribute names PostHog looks for) opens that reader's session replay at the
 * second it was written. The browser sends both; the Next.js route forwards
 * them; `readTraceIdentity` (convex/aiTrace.ts) checks them. Nothing else
 * identifies the reader.
 *
 * Logging must never cost a reader their answer, so callers schedule the send
 * (`scheduleLog`) rather than await it, and every step swallows its own errors.
 * With no POSTHOG_KEY in the Convex environment nothing is scheduled at all.
 * It is the same key, and the same POSTHOG_HOST, as the answer's AI trace.
 */
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const DEFAULT_HOST = "https://us.i.posthog.com";
const SERVICE_NAME = "billsincongress-convex";
/** Error text on a line is capped: it is for recognising a failure, not storing it. */
const MAX_STRING_LENGTH = 500;

export type LogLevel = "info" | "warn" | "error";
export type LogAttributes = Record<string, string | number | boolean>;

/** OpenTelemetry severity numbers: INFO 9, WARN 13, ERROR 17. */
const SEVERITY: Record<LogLevel, { text: string; number: number }> = {
  info: { text: "INFO", number: 9 },
  warn: { text: "WARN", number: 13 },
  error: { text: "ERROR", number: 17 },
};

export interface LogLine {
  level: LogLevel;
  /** A fixed phrase per kind of line ("answer failed"), so PostHog can group them. */
  message: string;
  attributes: LogAttributes;
  timestampMs: number;
}

function otlpValue(value: string | number | boolean) {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    // int64 travels as a string in OTLP JSON.
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: value.slice(0, MAX_STRING_LENGTH) };
}

/**
 * The OTLP/HTTP JSON body for one line. Pure, so the shape PostHog receives is
 * tested without a network (convex/posthogLogs.test.ts).
 */
export function otlpLogBody(line: LogLine) {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: SERVICE_NAME } }],
        },
        scopeLogs: [
          {
            scope: { name: "convex/posthogLogs" },
            logRecords: [
              {
                // Nanoseconds overflow a double, so append the zeros as text.
                timeUnixNano: `${Math.trunc(line.timestampMs)}000000`,
                severityNumber: SEVERITY[line.level].number,
                severityText: SEVERITY[line.level].text,
                body: { stringValue: line.message },
                attributes: Object.entries(line.attributes).map(([key, value]) => ({
                  key,
                  value: otlpValue(value),
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Queue one line for PostHog without waiting on it. Never throws.
 * `ctx` is anything with a scheduler: an action or an HTTP action.
 */
export async function scheduleLog(
  ctx: Pick<ActionCtx, "scheduler">,
  line: LogLine,
): Promise<void> {
  if (!process.env.POSTHOG_KEY) return;
  try {
    await ctx.scheduler.runAfter(0, internal.posthogLogs.emit, line);
  } catch (error) {
    console.warn("[posthog logs] could not schedule a log line:", error);
  }
}

export const emit = internalAction({
  args: {
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
    attributes: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
    timestampMs: v.number(),
  },
  returns: v.null(),
  handler: async (_ctx, line): Promise<null> => {
    const token = process.env.POSTHOG_KEY;
    if (!token) return null;
    const configured = process.env.POSTHOG_HOST;
    const host = (configured?.startsWith("https://") ? configured : DEFAULT_HOST).replace(/\/+$/, "");
    try {
      const response = await fetch(`${host}/i/v1/logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(otlpLogBody(line)),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 200);
        console.warn(`[posthog logs] PostHog refused a log line: ${response.status} ${detail}`);
      }
    } catch (error) {
      console.warn("[posthog logs] could not reach PostHog:", error);
    }
    return null;
  },
});
