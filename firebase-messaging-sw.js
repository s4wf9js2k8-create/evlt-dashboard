// EVLT Operations - push notification service worker.
//
// This deliberately does NOT use the Firebase SDK to display alerts. iPhones require every push to
// show a notification immediately and directly inside the "push" event, and the SDK's extra
// processing can miss that window, so the alert only appeared once the app was opened.
// The Cloud Function sends data-only messages: {data: {title, body, tag}}.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    try { payload = { data: { body: event.data.text() } }; } catch (e2) { payload = {}; }
  }
  const data = payload.data || {};
  const note = payload.notification || {};

  const title = data.title || note.title || '🚂 EVLT Operations';
  const body = data.body || note.body || 'You have a new alert.';
  const iconUrl = new URL('apple-touch-icon.png', self.location.href).href;
  const options = { body: body, icon: iconUrl, badge: iconUrl, data: data };
  if (data.tag) options.tag = data.tag;

  // Always show something: iOS cancels push permission for sites that receive a push without showing one.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = self.location.href.replace(/firebase-messaging-sw\.js.*/, '');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
