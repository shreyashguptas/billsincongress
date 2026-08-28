import { ConvexHttpClient } from 'convex/browser';

/**
 * The one place an HTTP Convex client is constructed. Returns null rather than
 * throwing when the deployment URL is absent (fresh clone, CI without secrets),
 * so every caller degrades to its own empty-result fallback instead of failing
 * the render.
 */
export function getConvexHttpClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}
