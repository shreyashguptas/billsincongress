import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import type { ConvexHttpClient } from "convex/browser";
import { cookies } from "next/headers";
import { getConvexHttpClient } from "@/lib/convex-client";

export const MAX_QUESTION_LENGTH = 2000;
export const ANONYMOUS_CHAT_DAILY_LIMIT = 5;

const ANONYMOUS_CHAT_SESSION_COOKIE = "bic_bill_chat_session";
const ANONYMOUS_CHAT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getConvexClient = getConvexHttpClient;

export function debugBillChatAuth(
  context: string,
  details: Record<string, boolean | number | string | null | undefined>,
) {
  if (process.env.BILL_CHAT_AUTH_DEBUG !== "1") return;
  console.info("[bill-chat-auth]", context, details);
}

export async function setConvexAuth(client: ConvexHttpClient, context: string) {
  const token = await convexAuthNextjsToken();
  debugBillChatAuth(context, { hasConvexAuthToken: Boolean(token) });
  if (token) client.setAuth(token);
  return { hasToken: Boolean(token) };
}

export async function getOrCreateAnonymousChatSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ANONYMOUS_CHAT_SESSION_COOKIE)?.value;
  if (existing && UUID_PATTERN.test(existing)) return existing;

  const next = crypto.randomUUID();
  cookieStore.set({
    name: ANONYMOUS_CHAT_SESSION_COOKIE,
    value: next,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ANONYMOUS_CHAT_SESSION_MAX_AGE_SECONDS,
  });
  return next;
}
