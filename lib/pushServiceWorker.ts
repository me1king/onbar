export async function ensurePushServiceWorkerReady(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/sw.js');
  let timeoutId: number | undefined;

  let readyRegistration: ServiceWorkerRegistration;
  try {
    readyRegistration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('The notification service worker did not become active. Refresh the page and try again.')),
          15_000
        );
      })
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }

  if (readyRegistration.scope !== registration.scope || !readyRegistration.active) {
    throw new Error('The notification service worker is not active for this site. Refresh the page and try again.');
  }

  return readyRegistration;
}
