import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import kvTagCache from "@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache";

/**
 * Cloudflare adapter config.
 *
 * The app uses Cache Components (`cacheComponents: true` + `'use cache'` +
 * `cacheTag`/`cacheLife`). Those require real cache backends — without them
 * OpenNext falls back to a "Dummy" cache that THROWS, which was the cause of
 * the intermittent Worker `1101` exceptions that broke pages at random.
 *
 * Backends (all KV — no Durable Objects needed, works with the current token):
 *   - incrementalCache: KV   (binding NEXT_INC_CACHE_KV)  — stores rendered output
 *   - tagCache:         KV   (binding NEXT_TAG_CACHE_KV)  — stores cacheTag mappings
 *   - queue: "direct"        — revalidates inline instead of via background
 *                              timers, sidestepping the runtime's setTimeout
 *                              limitation for Cache Components.
 *
 * `enableCacheInterception` stays at its default (false) because the app uses
 * Partial Prerendering (PPR), which is incompatible with cache interception.
 */
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: kvTagCache,
  queue: "direct",
});
