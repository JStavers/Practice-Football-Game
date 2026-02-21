/* ============================================================
   sw.js — Service Worker
   ============================================================
   Manages offline caching for the Quiz Engine PWA.

   Strategies:
     App Shell (HTML/CSS/JS) → Cache-first, network fallback
     External API calls      → Network-first, cache fallback
     Offline navigation      → Fallback to cached index.html

   To force all users to get a new version, bump CACHE_VERSION.
   ============================================================ */

"use strict";

/* ── Version — bump this string to invalidate the old cache ── */
const CACHE_VERSION = "v1";
const CACHE_NAME    = `quiz-engine-${CACHE_VERSION}`;

/* ── App Shell: files to pre-cache on install ─────────────── */
const APP_SHELL = [
  "./",
  "./index.html",
  "./builder.html",
  "./css/styles.css",
  "./css/nav.css",
  "./css/builder-styles.css",
  "./js/topics.js",
  "./js/api.js",
  "./js/mappingEngine.js",
  "./js/topicStorage.js",
  "./js/engine.js",
  "./js/ui.js",
  "./js/main.js",
  "./js/nav.js",
  "./js/pwa.js",
  "./js/builder.js",
  "./js/builder-ui.js",
  "./js/builder-export.js",
  "./js/apiBuilder.js",
  "./js/script.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./manifest.json",
];

/* ──────────────────────────────────────────────────────────────
   INSTALL — pre-cache the app shell
   ────────────────────────────────────────────────────────────── */
self.addEventListener("install", (event) => {
  console.log(`[SW ${CACHE_VERSION}] Installing…`);

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Use allSettled so one missing file doesn't kill the whole install
      const results = await Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url))
      );

      // Log any files that failed to cache (usually missing icons)
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          console.warn(`[SW] Could not cache: ${APP_SHELL[i]}`, result.reason);
        }
      });

      console.log(`[SW ${CACHE_VERSION}] App shell cached.`);
    })
    // Skip the waiting phase so the new SW activates straight away
    .then(() => self.skipWaiting())
  );
});

/* ──────────────────────────────────────────────────────────────
   ACTIVATE — delete any outdated caches
   ────────────────────────────────────────────────────────────── */
self.addEventListener("activate", (event) => {
  console.log(`[SW ${CACHE_VERSION}] Activating…`);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            // Only delete quiz-engine caches that belong to an older version
            .filter((name) => name.startsWith("quiz-engine-") && name !== CACHE_NAME)
            .map((name) => {
              console.log(`[SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        )
      )
      // Take immediate control of every open client tab
      .then(() => self.clients.claim())
      .then(() => console.log(`[SW ${CACHE_VERSION}] Active and in control.`))
  );
});

/* ──────────────────────────────────────────────────────────────
   FETCH — intercept every network request
   ────────────────────────────────────────────────────────────── */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET — POST/PUT/DELETE all pass through untouched
  if (request.method !== "GET") return;

  // Only handle http(s) — skip chrome-extension://, data:, etc.
  if (!request.url.startsWith("http")) return;

  const url = new URL(request.url);

  /* ── External API requests: Network-first ─────────────────
     Any request going to a different hostname (e.g. api-sports.io)
     is treated as a live API call.  We try the network first and
     fall back to any cached copy.                               */
  const isSameOrigin = url.origin === self.location.origin;
  const isApiPath    = url.pathname.startsWith("/players") ||
                       url.pathname.startsWith("/v3")       ||
                       url.hostname.includes("api-sports")  ||
                       url.hostname.includes("football.api");

  if (!isSameOrigin || isApiPath) {
    event.respondWith(networkFirstWithCacheFallback(request));
    return;
  }

  /* ── App Shell requests: Cache-first ──────────────────────
     HTML, CSS, JS, and icons are served from cache if present,
     otherwise fetched from the network and cached.             */
  event.respondWith(cacheFirstWithNetworkFallback(request));
});

/* ──────────────────────────────────────────────────────────────
   STRATEGY HELPERS
   ────────────────────────────────────────────────────────────── */

/**
 * Network-first strategy: try live network, fall back to cache.
 * Used for API requests so data is always as fresh as possible.
 */
async function networkFirstWithCacheFallback(request) {
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses for offline use
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    // Network failed — return cached copy if one exists
    const cached = await caches.match(request);
    if (cached) return cached;

    // Nothing in cache either — return a JSON error body
    return new Response(
      JSON.stringify({ error: "Offline — no cached API data available." }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Cache-first strategy: serve from cache, then network.
 * Used for the app shell (HTML/CSS/JS/icons).
 */
async function cacheFirstWithNetworkFallback(request) {  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);

    // Store in cache for next time
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    // Fully offline and not cached — serve index.html as fallback
    // so the app still "loads" even if the exact file isn't cached
    if (request.mode === "navigate") {
      const fallback = await caches.match("./index.html");
      if (fallback) return fallback;
    }

    // Nothing we can do
    return new Response("Offline — resource not cached.", { status: 503 });
  }
}

/* ──────────────────────────────────────────────────────────────
   MESSAGE — handle commands from the page (e.g. pwa.js)
   ────────────────────────────────────────────────────────────── */

/**
 * When pwa.js sends { type: "SKIP_WAITING" } (triggered by the
 * update banner's "Refresh" button), tell this SW to activate
 * immediately without waiting for all tabs to close.
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
