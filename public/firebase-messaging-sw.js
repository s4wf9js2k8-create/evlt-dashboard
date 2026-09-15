// Give the service worker access to Firebase Messaging.
// Note: We use compat libraries inside the service worker.
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in the configuration
const firebaseConfig = {
  apiKey: "AIzaSyAX79ysaODygo5BqzbVLN6fYWMxPXg-AMY",
  authDomain: "evlt-admin.firebaseapp.com",
  databaseURL: "https://evlt-admin-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "evlt-admin",
  storageBucket: "evlt-admin.firebasestorage.app",
  messagingSenderId: "603418741774",
  appId: "1:603418741774:web:b9d4717f3dc4a3ede5805f",
  measurementId: "G-7HQB18640R"
};

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background push message: ', payload);

  const title = payload.notification?.title || payload.data?.title || '🚂 EVLT Operations Alert';
  const options = {
    body: payload.notification?.body || payload.data?.body || 'Safety or operational alert received.',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag: payload.data?.tag || 'evlt-alert',
    data: payload.data || {}
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
