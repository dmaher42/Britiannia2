const CACHE_VERSION = 'britannia-precache-v1';
const CORE_ASSETS = [
  './',
  './index.html',
];

const cacheCoreAssets = async () => {
  try {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(CORE_ASSETS);
  } catch (error) {
    console.warn('Service worker failed to precache core assets:', error);
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(cacheCoreAssets());
  self.skipWaiting();
});

const removeOldCaches = async () => {
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_VERSION)
        .map((key) => caches.delete(key))
    );
  } catch (error) {
    console.warn('Service worker cache cleanup failed:', error);
  }
};

self.addEventListener('activate', (event) => {
  event.waitUntil(removeOldCaches());
  self.clients.claim();
});

const shouldHandleRequest = (request) => {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  return url.origin === self.location.origin;
};

const networkWithCacheFallback = async (request) => {
  try {
    const networkResponse = await fetch(request);

    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
      return networkResponse;
    }

    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, networkResponse.clone()).catch((error) => {
      console.warn('Service worker failed to cache response:', error);
    });

    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) {
        return fallback;
      }
    }

    return new Response('Service unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
};

self.addEventListener('fetch', (event) => {
  if (!shouldHandleRequest(event.request)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) {
        event.waitUntil(networkWithCacheFallback(event.request));
        return cached;
      }

      return networkWithCacheFallback(event.request);
    })().catch((error) => {
      console.warn('Service worker fetch handler failed:', error);
      return new Response('Service unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' },
      });
    })
  );
});
