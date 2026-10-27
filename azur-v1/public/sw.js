// AZUR V2: network-first app shell, with cache versioning for installed PWAs.
const CACHE = 'azur-v2-shell-20261027';
const SHELL = ['/manifest.webmanifest', '/brand/azur-logo.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never serve a cached app shell or bundled JS when online.
  // Otherwise installed iOS PWAs can remain on an outdated interface.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(
      () => new Response('AZUR is offline. Please reconnect to load your training dashboard.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      })
    ));
    return;
  }

  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && !url.pathname.startsWith('/assets/')) {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request).then(hit => hit || Response.error()))
  );
});
