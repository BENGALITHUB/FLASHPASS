/*
 * FlashPass service worker: lets a pass open with no internet (SRS FR-M2-07).
 *
 * - The app shell (index.html + the JS/CSS it loads) is cached at install time,
 *   so even the very first visit leaves everything needed on the phone.
 * - Pages: network first (always fresh when online), cached copy when offline.
 * - /assets/* files have content hashes in their names, so they never change:
 *   served from cache first.
 * - API calls are never cached here. The pass page keeps its own copy of the
 *   pass in localStorage and draws the QR on the phone.
 */
const VERSION = 'flashpass-v5';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const FONTS = `${VERSION}-fonts`;

// Cache the JS/CSS a given index.html loads, plus the files those load later
// (3D hero, Save Image / PDF libraries), skipping files already cached
async function cacheAssetsOf(html) {
  const assets = await caches.open(ASSETS);
  const ensure = async (u) => {
    if (!(await assets.match(u, { ignoreVary: true }))) await assets.add(u).catch(() => {});
  };
  const entry = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) || [])];
  await Promise.all(entry.map(ensure));

  // Pages are separate files (pass page, checkout, ...), and they load more
  // files of their own. Follow the references so all of it is on the phone.
  const seen = new Set(entry);
  let queue = entry.filter(x => x.endsWith('.js'));
  while (queue.length && seen.size < 200) {
    const next = [];
    for (const u of queue) {
      const res = await assets.match(u, { ignoreVary: true });
      const code = res ? await res.text() : '';
      for (const m of code.match(/assets\/[\w.-]+\.(?:js|css)/g) || []) {
        const url = `/${m}`;
        if (seen.has(url)) continue;
        seen.add(url);
        await ensure(url);
        if (url.endsWith('.js')) next.push(url);
      }
    }
    queue = next;
  }
}

async function cacheShell() {
  const res = await fetch('/index.html', { cache: 'no-store' });
  if (!res.ok) return;
  const html = await res.clone().text();
  const cache = await caches.open(SHELL);
  await cache.put('/index.html', res);
  await cache.addAll(['/favicon.svg', '/manifest.webmanifest']).catch(() => {});
  await cacheAssetsOf(html);
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, ASSETS, FONTS];
    for (const key of await caches.keys()) {
      if (!keep.includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

async function pageRequest(request) {
  try {
    const res = await Promise.race([fetch(request), timeout(5000)]);
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
      // Every page is the same SPA shell; keep the newest copy (and its files) for offline use
      const copy = res.clone();
      copy.clone().text()
        .then(html => caches.open(SHELL).then(c => c.put('/index.html', copy)).then(() => cacheAssetsOf(html)))
        .catch(() => {});
    }
    return res;
  } catch {
    const cached = await caches.match('/index.html', MATCH);
    return cached || new Response('<h1>You are offline</h1>', { headers: { 'Content-Type': 'text/html' }, status: 503 });
  }
}

// ignoreVary: the server sends "Vary: Origin" (CORS), which would otherwise stop
// a cached file from matching the page's request for it
const MATCH = { ignoreVary: true };

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, MATCH);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') {
    const copy = res.clone();
    caches.open(cacheName).then(c => c.put(request, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return; // live data only
    if (request.mode === 'navigate') return event.respondWith(pageRequest(request));
    if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(request, ASSETS));
    if (url.pathname === '/favicon.svg' || url.pathname === '/manifest.webmanifest') {
      return event.respondWith(cacheFirst(request, SHELL));
    }
    return;
  }

  // Comic fonts, so the offline pass still looks right
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONTS));
  }
});
