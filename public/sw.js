// Keep navigations online so an old homepage can never replace the current app.

const CACHE_NAME = 'ob-os-static-v3';
const ASSETS_TO_CACHE = [
  '/favicon.svg',
  '/images/NoImage.jpg',
  '/widgets/mobile-node.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName !== CACHE_NAME
            && (cacheName.startsWith('ob-os-cache-') || cacheName.startsWith('ob-os-static-'))
          ) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.mode === 'navigate') return;
  if (!ASSETS_TO_CACHE.includes(url.pathname)) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;
      throw error;
    }
  })());
});

/**
 * 🛰️ WIDGET ORCHESTRATION
 * Handling home screen node events for Android/Windows terminals.
 */

self.addEventListener('widgetinstall', (event) => {
  console.log('[OB_OS] Widget Installed:', event.widget.tag);
  event.waitUntil(updateWidget(event.widget));
});

self.addEventListener('widgetresume', (event) => {
  console.log('[OB_OS] Widget Resumed:', event.widget.tag);
  event.waitUntil(updateWidget(event.widget));
});

self.addEventListener('widgetclick', (event) => {
  if (event.action === 'explore') {
    event.waitUntil(clients.openWindow(event.data.deep_link || '/shop'));
  }
});

async function updateWidget(widget) {
  try {
    const response = await fetch('/api/mobile/widget-config');
    const data = await response.json();

    // Sync with PWA Widget Template
    await self.widgets.updateByTag(widget.tag, {
      template: '/widgets/mobile-node.json',
      data: data
    });
  } catch (err) {
    console.error('[OB_OS] Widget Sync Failure:', err);
  }
}
