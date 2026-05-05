import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { ConvexHttpClient } from "convex/browser";

export const MAX_QUESTION_LENGTH = 2000;

export function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

export async function setConvexAuth(client: ConvexHttpClient) {
  const token = await convexAuthNextjsToken();
  if (token) client.setAuth(token);
}
