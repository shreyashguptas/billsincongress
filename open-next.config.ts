import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import kvTagCache from "@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache";

/**
 * Cloudflare adapter config.
 *
 * Next.js Cache Components, the `'use cache'` directive and Partial
 * Prerendering are all DISABLED here and must stay that way -- they crash on
 * Workers. next.config.mjs sets none of them, and nothing under app/ or lib/
 * uses `'use cache'`. An earlier version of this comment claimed the opposite,
 * which was wrong in a dangerous direction: it read as a reason to turn them
 * back on.
 *
 * The cache backends below are still required. The app revalidates on a
 * schedule (the sitemap routes carry a one-day revalidate), and without real
 * backends OpenNext falls back to a "Dummy" cache that THROWS -- the cause of
 * the intermittent Worker `1101` exceptions that broke pages at random.
 *
 * Backends (all KV -- no Durable Objects needed, works with the current token):
 *   - incrementalCache: KV   (binding NEXT_INC_CACHE_KV)  -- stores rendered output
 *   - tagCache:         KV   (binding NEXT_TAG_CACHE_KV)  -- stores cacheTag mappings
 *   - queue: "direct"        -- revalidates inline rather than via background
 *                               timers, which the Workers runtime limits.
 *
 * `enableCacheInterception` is left at its default (false) and has not been
 * evaluated on its merits; the previous justification here rested on PPR being
 * on, which it is not.
 */
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: kvTagCache,
  queue: "direct",
});
