import { v } from "convex/values";

const CHAT_GATEWAY_MAX_AGE_MS = 2 * 60 * 1000;

export const chatGatewayValidator = v.object({
  issuedAt: v.number(),
  anonSessionKey: v.string(),
  anonNetworkKey: v.string(),
  signature: v.string(),
});

export type ChatGateway = {
  issuedAt: number;
  anonSessionKey: string;
  anonNetworkKey: string;
  signature: string;
};

function gatewayPayload(gateway: Omit<ChatGateway, "signature">): string {
  return [
    gateway.issuedAt.toString(),
    gateway.anonSessionKey,
    gateway.anonNetworkKey,
  ].join("\n");
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function signGatewayPayload(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return hex(signature);
}

export async function verifyChatGateway(
  gateway: ChatGateway | undefined,
): Promise<boolean> {
  if (!gateway) return false;

  const secret = process.env.CHAT_GATEWAY_SECRET;
  if (!secret) return false;

  if (Math.abs(Date.now() - gateway.issuedAt) > CHAT_GATEWAY_MAX_AGE_MS) {
    return false;
  }

  const expected = await signGatewayPayload(
    secret,
    gatewayPayload({
      issuedAt: gateway.issuedAt,
      anonSessionKey: gateway.anonSessionKey,
      anonNetworkKey: gateway.anonNetworkKey,
    }),
  );
  return equalHex(expected, gateway.signature);
}
