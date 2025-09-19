const CORE_CACHE = 'britannia-core-v2';
const MODEL_CACHE = 'britannia-models-v1';
const MODEL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CORE_ASSETS = ['./', './index.html'];

const stampResponse = async (response) => {
  const buffer = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set('X-Britannia-Cache-Timestamp', Date.now().toString());
  return new Response(buffer, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const getCacheAge = (response) => {
  const header = response.headers.get('X-Britannia-Cache-Timestamp');
  if (!header) {
    return null;
  }
  const timestamp = Number(header);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return Date.now() - timestamp;
};

const isModelRequest = (url) => {
  if (url.origin !== self.location.origin) {
    return false;
  }
  return url.pathname.includes('/assets/models/web/');
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch((error) => {
        console.warn('Service worker failed to precache core assets:', error);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CORE_CACHE && key !== MODEL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .catch((error) => {
        console.warn('Service worker cache cleanup failed:', error);
      })
  );
  self.clients.claim();
});

const handleCoreRequest = async (request) => {
  const cache = await caches.open(CORE_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone()).catch((error) => {
        console.warn('Service worker failed to cache core response:', error);
      });
    }
    return networkResponse;
  } catch (error) {
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
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

const handleModelRequest = async (request) => {
  const cache = await caches.open(MODEL_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const stamped = await stampResponse(networkResponse.clone());
      cache.put(request, stamped).catch((error) => {
        console.warn('Service worker failed to cache model response:', error);
      });
    }
    return networkResponse;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      const age = getCacheAge(cached);
      if (age !== null && age > MODEL_CACHE_MAX_AGE_MS) {
        console.warn('Serving stale model from cache (older than 24h):', request.url);
      }
      return cached;
    }
    return new Response('Model unavailable', {
      status: 503,
      statusText: 'Model Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  if (isModelRequest(url)) {
    event.respondWith(handleModelRequest(event.request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(handleCoreRequest(event.request));
  }
});
