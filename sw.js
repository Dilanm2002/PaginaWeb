// Service worker mínimo — solo existe para poder recibir Web Push y
// mostrar la notificación del "Llamar mesero" aunque el teléfono esté
// bloqueado o el navegador en segundo plano. No cachea nada ni interfiere
// con el resto del sitio.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || '🔔 Caja te está llamando';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Acércate al despacho',
    vibrate: [500, 200, 500, 200, 500, 200, 500, 200, 500],
    icon: 'assets/favicon.svg',
    tag: 'llamado-mesero',
    renotify: true,
    requireInteraction: true
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
