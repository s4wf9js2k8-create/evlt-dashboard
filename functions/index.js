import { onValueWritten } from 'firebase-functions/v2/database';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

if (!getApps().length) {
  initializeApp({
    databaseURL: 'https://evlt-admin-default-rtdb.europe-west1.firebasedatabase.app'
  });
}

// Notifications are stored as a list (array or keyed object) at EVLT_ADMIN_DB/notifications.
const asList = value => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean);
  return [];
};

// Which notifications were added by this write? Only ones that are new (by id) and recent,
// so editing, deleting or restoring the list never re-sends old alerts.
export function pickNewNotifications(beforeValue, afterValue, nowMs = Date.now()) {
  const known = new Set(asList(beforeValue).map(n => n.id));
  return asList(afterValue)
    .filter(n => n.id && !known.has(n.id))
    .filter(n => {
      const sent = Date.parse(n.sentAt || '');
      return Number.isFinite(sent) && nowMs - sent < 10 * 60 * 1000;
    })
    .slice(-3);
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

async function pushToAllDevices(notification) {
  const summary = { title: String(notification.title || ''), registered: 0, targeted: 0, sent: 0, failed: 0, stale: 0, errors: [] };
  const tokensRef = getDatabase().ref('push_tokens');
  const snapshot = await tokensRef.once('value');
  const all = Object.entries(snapshot.val() || {})
    .filter(([, item]) => item && typeof item.token === 'string' && item.token.length > 10);
  summary.registered = all.length;
  const entries = all
    // The device that sent it already showed the alert locally. Other devices (even signed in as
    // the same person) still get it. Older entries without a device id fall back to the sender's name.
    .filter(([, item]) => notification.senderDevice
      ? item.deviceId !== notification.senderDevice
      : (!notification.sentBy || item.user !== notification.sentBy));
  summary.targeted = entries.length;

  if (!entries.length) {
    logger.info(`No devices to send to (registered: ${summary.registered}).`);
    return summary;
  }

  const title = '🚂 ' + String(notification.title || 'EVLT Operations');
  const data = {
    title,
    body: String(notification.body || ''),
    tag: 'evlt-notif-' + notification.id
  };

  const staleKeys = [];
  for (let i = 0; i < entries.length; i += 500) {
    const chunk = entries.slice(i, i + 500);
    // Data-only message: the service worker shows it, so each device gets exactly one alert.
    const result = await getMessaging().sendEachForMulticast({
      tokens: chunk.map(([, item]) => item.token),
      data,
      webpush: { headers: { Urgency: 'high', TTL: '86400' } }
    });
    summary.sent += result.successCount;
    summary.failed += result.failureCount;
    result.responses.forEach((response, index) => {
      if (response.success || !response.error) return;
      const code = response.error.code || 'unknown';
      if (summary.errors.length < 4) summary.errors.push(`${code}: ${String(response.error.message || '').slice(0, 160)}`);
      if (INVALID_TOKEN_CODES.has(code)) staleKeys.push(chunk[index][0]);
    });
  }

  // Forget devices that uninstalled the app or revoked permission
  await Promise.all(staleKeys.map(key => tokensRef.child(key).remove()));
  summary.stale = staleKeys.length;
  logger.info(`Push "${notification.title}": ${summary.sent} sent, ${summary.failed} failed, ${summary.stale} stale tokens removed.`);
  return summary;
}

export const sendNotificationPush = onValueWritten(
  {
    ref: '/EVLT_ADMIN_DB/notifications',
    instance: 'evlt-admin-default-rtdb',
    region: 'europe-west1'
  },
  async event => {
    const beforeList = asList(event.data.before.val());
    const afterList = asList(event.data.after.val());
    const fresh = pickNewNotifications(event.data.before.val(), event.data.after.val());
    logger.info(`Notifications changed: ${beforeList.length} -> ${afterList.length}, ${fresh.length} new to send.`);

    const report = {
      at: new Date().toISOString(),
      before: beforeList.length,
      after: afterList.length,
      newCount: fresh.length,
      results: []
    };
    for (const notification of fresh) {
      try {
        report.results.push(await pushToAllDevices(notification));
      } catch (err) {
        logger.error('Push failed for notification ' + notification.id, err);
        report.results.push({ title: String(notification.title || ''), error: String((err && err.message) || err).slice(0, 300) });
      }
    }
    // A short report the admin can see in the app (Notification Centre)
    try {
      await getDatabase().ref('push_status/last').set(report);
    } catch (err) {
      logger.error('Could not save push status report', err);
    }
  }
);
