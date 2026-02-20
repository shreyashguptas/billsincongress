export const PRODUCTION_CONVEX_URL = 'https://industrious-llama-331.convex.cloud';

export function getConvexUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  return configuredUrl || PRODUCTION_CONVEX_URL;
}
