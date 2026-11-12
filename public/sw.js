/* global self */
// No fetch cache: account, attendance and payroll data always come from the server.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let message = {};
  try { message = event.data?.json() || {}; } catch { /* A visible fallback is required for every push. */ }
  const title = typeof message.title === 'string' ? message.title : 'KidIT Manager';
  const body = typeof message.body === 'string' ? message.body : 'Bạn có thông báo mới. Mở KidIT để xem.';
  let url = '/';
  try {
    const target = new URL(message.url || '/', self.location.origin);
    if (target.origin === self.location.origin) url = target.pathname + target.search + target.hash;
  } catch { /* Keep the home page for invalid destinations. */ }
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/logo.png', tag: typeof message.tag === 'string' ? message.tag : 'kidit', data: { url },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === target.origin && 'focus' in client) {
        const navigated = await client.navigate(target.href);
        await (navigated || client).focus();
        return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});
