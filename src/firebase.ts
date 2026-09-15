import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';

export const firebaseConfig = {
  apiKey: "AIzaSyAX79ysaODygo5BqzbVLN6fYWMxPXg-AMY",
  authDomain: "evlt-admin.firebaseapp.com",
  databaseURL: "https://evlt-admin-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "evlt-admin",
  storageBucket: "evlt-admin.firebasestorage.app",
  messagingSenderId: "603418741774",
  appId: "1:603418741774:web:b9d4717f3dc4a3ede5805f",
  measurementId: "G-7HQB18640R"
};

export const VAPID_KEY = "BBxni9UFiHxKnAW2w0Zhd-WXrrBQwuAqYgw_QqIeH9llPXaz1_bcbcWZo-0QN3r-ANXoQI2hvjZI5WnL7RbV_88";

// Initialize client Firebase app
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let messagingInstance: Messaging | null = null;

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}

export async function requestFCMToken(): Promise<{ success: boolean; token?: string; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Window environment not available.' };
  }

  try {
    const supported = await isSupported().catch(() => false);
    if (!supported) {
      return {
        success: false,
        error: 'Push messaging is restricted or unsupported in this iframe. Open the app directly in a full browser tab to register.'
      };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: `Notification permission status: ${permission}` };
    }

    // Register service worker
    let swRegistration: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;
      } catch (swErr: any) {
        console.warn('Service worker registration notice:', swErr);
      }
    }

    const messaging = getMessaging(app);
    const currentToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration
    });

    if (currentToken) {
      return { success: true, token: currentToken };
    } else {
      return { success: false, error: 'No FCM registration token returned from Firebase.' };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to request FCM token' };
  }
}

export function subscribeToForegroundMessages(onMessageReceived: (payload: any) => void) {
  if (typeof window === 'undefined') return () => {};
  let unsubscribe = () => {};

  getFirebaseMessaging().then((messaging) => {
    if (messaging) {
      unsubscribe = onMessage(messaging, (payload) => {
        onMessageReceived(payload);
      });
    }
  });

  return () => unsubscribe();
}
