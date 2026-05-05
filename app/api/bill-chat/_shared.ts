import { createHmac, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { ConvexHttpClient } from "convex/browser";

const CHAT_COOKIE = "bic_anon_chat_id";
const CHAT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const MAX_QUESTION_LENGTH = 2000;

export type ChatGateway = {
  issuedAt: number;
  anonSessionKey: string;
  anonNetworkKey: string;
  signature: string;
};

export function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

export async function setConvexAuth(client: ConvexHttpClient) {
  const token = await convexAuthNextjsToken();
  if (token) client.setAuth(token);
}

function requireGatewaySecret(): string {
  const secret = process.env.CHAT_GATEWAY_SECRET;
  if (!secret) {
    throw new Error("CHAT_GATEWAY_SECRET is not configured.");
  }
  return secret;
}

function hmacHex(secret: string, parts: string[]): string {
  return createHmac("sha256", secret).update(parts.join("\n")).digest("hex");
}

function makeGatewayPayload(gateway: Omit<ChatGateway, "signature">): string[] {
  return [
    gateway.issuedAt.toString(),
    gateway.anonSessionKey,
    gateway.anonNetworkKey,
  ];
}

function firstForwardedIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function getOrCreateAnonCookie(request: NextRequest): {
  value: string;
  shouldSet: boolean;
} {
  const existing = request.cookies.get(CHAT_COOKIE)?.value;
  if (existing && /^[a-f0-9]{64}$/.test(existing)) {
    return { value: existing, shouldSet: false };
  }
  return { value: randomBytes(32).toString("hex"), shouldSet: true };
}

export function buildGateway(
  request: NextRequest,
  cookieValue: string,
): ChatGateway {
  const secret = requireGatewaySecret();
  const ip = firstForwardedIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const issuedAt = Date.now();
  const anonSessionKey = hmacHex(secret, ["anon-session", cookieValue]);
  const anonNetworkKey = hmacHex(secret, ["anon-network", ip, userAgent]);
  const unsigned = { issuedAt, anonSessionKey, anonNetworkKey };
  return {
    ...unsigned,
    signature: hmacHex(secret, makeGatewayPayload(unsigned)),
  };
}

export function withAnonCookie(
  response: NextResponse,
  cookieValue: string,
  shouldSet: boolean,
): NextResponse {
  if (!shouldSet) return response;
  response.cookies.set({
    name: CHAT_COOKIE,
    value: cookieValue,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHAT_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
