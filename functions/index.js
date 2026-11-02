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


// Admin-only callable: permanently remove all EVLT approval records for one account.
// Uses the Admin SDK so database rules cannot silently block a partial client-side delete.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';

export const forceRevokeAccount = onCall(
  { region: 'europe-west1', cors: true },
  async request => {
    const callerUid = request.auth?.uid;
    if (!callerUid || request.auth?.token?.email_verified !== true) {
      throw new HttpsError('unauthenticated', 'Sign in with a verified account first.');
    }

    const db = getDatabase();
    const adminSnapshot = await db.ref('EVLT_SYSTEM_ADMIN_UIDS/' + callerUid).get();
    if (adminSnapshot.val() !== true) {
      throw new HttpsError('permission-denied', 'Your Firebase UID is not an authorised EVLT System Admin.');
    }

    const targetUid = String(request.data?.uid || '').trim();
    if (!targetUid || targetUid.length > 128 || targetUid === callerUid) {
      throw new HttpsError('invalid-argument', 'A valid different account UID is required.');
    }

    const [bindingsSnap, requestsSnap, permissionsSnap] = await Promise.all([
      db.ref('EVLT_ACCOUNT_BINDINGS').get(),
      db.ref('EVLT_ACCOUNT_REQUESTS').get(),
      db.ref('EVLT_ADMIN_DB/userPermissions').get()
    ]);
    const bindings = bindingsSnap.val() || {};
    const requests = requestsSnap.val() || {};
    const permissions = permissionsSnap.val() || {};
    const selected = bindings[targetUid] || null;
    const selectedRequest = requests[targetUid] || null;
    const email = String(selected?.email || selectedRequest?.email || '').trim().toLowerCase();
    const name = String(selected?.volunteerName || selectedRequest?.name || '').trim().toLowerCase();

    const bindingUids = Object.entries(bindings).filter(([key, value]) =>
      key === targetUid || (value && (
        (email && String(value.email || '').trim().toLowerCase() === email) ||
        (name && String(value.volunteerName || '').trim().toLowerCase() === name)
      ))
    ).map(([key]) => key);
    const requestUids = Object.entries(requests).filter(([key, value]) =>
      key === targetUid || (value && (
        (email && String(value.email || '').trim().toLowerCase() === email) ||
        (name && String(value.name || '').trim().toLowerCase() === name)
      ))
    ).map(([key]) => key);
    const permissionKeys = Object.keys(permissions).filter(key =>
      name && key.trim().toLowerCase() === name
    );

    const updates = {};
    bindingUids.forEach(key => { updates['EVLT_ACCOUNT_BINDINGS/' + key] = null; });
    requestUids.forEach(key => { updates['EVLT_ACCOUNT_REQUESTS/' + key] = null; });
    permissionKeys.forEach(key => { updates['EVLT_ADMIN_DB/userPermissions/' + key] = null; });

    if (!Object.keys(updates).length) {
      throw new HttpsError('not-found', 'No matching approval, request or legacy permission record was found.');
    }

    await db.ref().update(updates);

    const [afterBindings, afterRequests, afterPermissions] = await Promise.all([
      db.ref('EVLT_ACCOUNT_BINDINGS').get(),
      db.ref('EVLT_ACCOUNT_REQUESTS').get(),
      db.ref('EVLT_ADMIN_DB/userPermissions').get()
    ]);
    const leftBinding = Object.entries(afterBindings.val() || {}).some(([key, value]) =>
      bindingUids.includes(key) || (value && (
        (email && String(value.email || '').trim().toLowerCase() === email) ||
        (name && String(value.volunteerName || '').trim().toLowerCase() === name)
      ))
    );
    const leftRequest = Object.entries(afterRequests.val() || {}).some(([key, value]) =>
      requestUids.includes(key) || (value && (
        (email && String(value.email || '').trim().toLowerCase() === email) ||
        (name && String(value.name || '').trim().toLowerCase() === name)
      ))
    );
    const leftPermission = Object.keys(afterPermissions.val() || {}).some(key =>
      name && key.trim().toLowerCase() === name
    );
    if (leftBinding || leftRequest || leftPermission) {
      throw new HttpsError('internal', 'The server write completed but verification found matching records still present.');
    }

    // Disable the Firebase Auth user as well, if it exists. Keep the Auth record
    // so an administrator can restore access later if this was a mistake.
    let authDisabled = false;
    try {
      await getAuth().updateUser(targetUid, { disabled: true });
      await getAuth().revokeRefreshTokens(targetUid);
      authDisabled = true;
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }

    return {
      success: true,
      removedBindings: bindingUids.length,
      removedRequests: requestUids.length,
      removedLegacyPermissions: permissionKeys.length,
      authDisabled
    };
  }
);
