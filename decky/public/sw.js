// Playing without a connection.
//
// Everything except playing with other people already runs entirely in the browser — the engine,
// the bots, the whole library, the editor. So an offline card game is not a compromise version
// of this app; it is nearly all of it. The only thing that stops working is the part that needs
// a server, and that part fails the way it already does when no host is running.
//
// Two strategies, chosen by what the request is for:
//
//   The app itself (documents, scripts, styles, fonts, icons) is cached and served from cache
//   first. It changes only when a new build is deployed, and a new build gets a new cache name,
//   so there is no staleness to manage.
//
//   Anything that talks to the host (/health, /open, /join, /api/*, sockets) is never cached and
//   never intercepted. A cached answer about whether a table exists would be a lie.

const VERSION = 'decky-v3';

/** Files whose names never change. The hashed build output is discovered below. */
const STATIC = [
  '/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg',
  '/fonts/outfit-latin.woff2', '/fonts/outfit-latin-ext.woff2',
];

/**
 * Find the built script and stylesheet.
 *
 * Their filenames carry a content hash, so they cannot be listed here — and they are fetched by
 * the page before this worker ever takes control, which means runtime caching alone never sees
 * them and the first offline load has an empty shell and no app. So the install step reads the
 * document it is about to cache and takes the asset URLs out of it.
 */
async function shellAssets() {
  try {
    const res = await fetch('/index.html', { cache: 'reload' });
    if (!res.ok) return [];
    const html = await res.text();
    const found = new Set();
    for (const m of html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|woff2|svg))"/g)) found.add(m[1]);
    return [...found];
  } catch {
    return [];
  }
}

self.addEventListener('install', (e) => {
  // Take over as soon as this version is ready rather than waiting for every tab to close.
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const assets = await shellAssets();
    // Fetched and stored one at a time, keyed by the plain URL.
    //
    // Two things had to be got right here. addAll rejects the whole batch if any single file
    // 404s, which would leave the app with no offline support because of one missing font. And
    // storing the Request object rather than the URL string makes the entry carry the request's
    // own headers, so a later lookup with different Accept-Encoding misses a file that is
    // demonstrably in the cache — which is exactly the bug that made the first offline load
    // render a blank page.
    await Promise.all([...STATIC, ...assets].map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
      } catch { /* skip it */ }
    }));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/** Requests that must always go to the network, because the answer is about live state. */
function isHostCall(url) {
  return /^\/(health|open|join|quickplay|games|author|api)\b/.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isHostCall(url)) return;

  // A navigation offline should still open the app, not a browser error page.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { return await fetch(req); }
      catch { return (await caches.match('/index.html')) ?? Response.error(); }
    })());
    return;
  }

  e.respondWith((async () => {
    // ignoreVary because entries are keyed by URL: the encoding a response was stored with is
    // not a reason to refuse it to a page that is offline and asking for the same file.
    const hit = await caches.match(req, { ignoreSearch: true, ignoreVary: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      // Only keep what the build produced; an opaque or failed response is not worth storing.
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        void caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    } catch {
      // Deliberately NOT falling back to index.html here. Handing a script request a page of
      // HTML produces a syntax error and a blank screen, which is a worse failure than the
      // honest one.
      return Response.error();
    }
  })());
});
