// Keep navigations online so an old homepage can never replace the current app.

const CACHE_NAME = 'ob-os-static-v3';
const ASSETS_TO_CACHE = [
  '/favicon.svg',
  '/images/NoImage.avif',
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

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    const parsed = event.data ? event.data.json() : {};
    payload = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('[OB_OS] Invalid push payload:', error);
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Order update';
  const body = typeof payload.body === 'string' ? payload.body : 'There is an update to your delivery.';
  const url = typeof payload.url === 'string' ? payload.url : '/profile';
  const expiry = typeof payload.expiresAt === 'string' ? Date.parse(payload.expiresAt) : null;
  if (expiry !== null && Number.isFinite(expiry) && expiry <= Date.now()) return;
  const merchantOrder = Number.isSafeInteger(payload.orderId);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: typeof payload.tag === 'string' ? payload.tag : 'onlinebar-order',
    renotify: false,
    requireInteraction: payload.requireInteraction === true,
    vibrate: merchantOrder ? [300, 150, 300, 150, 600] : undefined,
    actions: merchantOrder ? [{ action: 'open', title: 'Open order' }] : undefined,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url, orderId: merchantOrder ? payload.orderId : null }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url;
  let targetUrl = new URL('/profile', self.location.origin);
  if (typeof requestedUrl === 'string') {
    try {
      const parsed = new URL(requestedUrl, self.location.origin);
      if (parsed.origin === self.location.origin) targetUrl = parsed;
    } catch (error) {
      console.error('[OB_OS] Invalid notification destination:', error);
    }
  }

  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    const existing = windowClients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      return existing.navigate(targetUrl.href).then(() => existing.focus());
    }
    return clients.openWindow(targetUrl.href);
  }));
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
