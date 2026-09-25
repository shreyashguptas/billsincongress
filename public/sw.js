// Bills in Congress service worker (Documentation/overview.md, "Installed app").
//
// It has ONE job: when a page is opened with no connection, show
// /offline.html instead of the browser's own error screen. That is what makes
// the installed app behave like an app when the signal drops.
//
// It deliberately caches nothing else. Every page, script and API call goes to
// the network exactly as it would with no service worker, so a deploy can
// never be hidden behind a stale copy. If this file ever grows a cache for
// pages or chunks, it has to handle deploy skew (next.config.mjs,
// `deploymentId`) first.
//
// Bump OFFLINE_CACHE when offline.html changes, so installs pick up the new one.

const OFFLINE_CACHE = 'offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Navigation preload starts the page request while this worker boots,
      // so having a worker costs a navigation no time.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      for (const key of await caches.keys()) {
        if (key !== OFFLINE_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  // Page loads only. Everything else never touches this worker.
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(event.request);
      } catch {
        // The network itself failed (an HTTP error is a response, not this).
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});
