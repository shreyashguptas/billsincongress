/**
 * The Convex deployment's HTTP address (`*.convex.site`), where its HTTP
 * actions live, or null when no backend is configured.
 */
export function convexSiteUrl(): string | null {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;
  return process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? convexUrl.replace('.convex.cloud', '.convex.site');
}
