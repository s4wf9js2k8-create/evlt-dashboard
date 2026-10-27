import { onValueWritten } from 'firebase-functions/v2/database';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

if (!getApps().length) {
  initializeApp({
    databaseURL: 'https://evlt-admin-default-rtdb.europe-west1.firebasedatabase.app'
  });
}

const db = getDatabase();
const messaging = getMessaging();

/**
 * Helper: sends Web Push notification to all tokens stored in /EVLT_PUSH_TOKENS
 */
async function broadcastPushNotification(notificationData) {
  const { id, title, body, sentBy, sentAt, url } = notificationData;
  const tokensSnapshot = await db.ref('EVLT_PUSH_TOKENS').once('value');
  const tokensVal = tokensSnapshot.val();

  if (!tokensVal || typeof tokensVal !== 'object') {
    logger.info('No registered push tokens found in /EVLT_PUSH_TOKENS.');
    return { sent: 0, failed: 0 };
  }

  const tokenEntries = Object.entries(tokensVal);
  const validTokens = [];
  const tokenKeys = [];

  for (const [key, item] of tokenEntries) {
    const t = item?.token;
    if (typeof t === 'string' && t.trim().length > 10) {
      validTokens.push(t.trim());
      tokenKeys.push(key);
    }
  }

  if (validTokens.length === 0) {
    logger.info('No valid token strings found.');
    return { sent: 0, failed: 0 };
  }

  logger.info(`Sending push notification "${title}" to ${validTokens.length} devices.`);

  const destinationUrl = url || 'https://s4wf9js2k8-create.github.io/evlt-dashboard/';

  const message = {
    tokens: validTokens,
    notification: {
      title: title || '🚂 EVLT Operations Alert',
      body: body || 'New operational update.'
    },
    data: {
      notifId: String(id || Date.now()),
      title: String(title || ''),
      body: String(body || ''),
      sentBy: String(sentBy || 'System'),
      sentAt: String(sentAt || new Date().toISOString()),
      url: destinationUrl
    },
    webpush: {
      headers: {
        Urgency: 'high'
      },
      notification: {
        icon: 'apple-touch-icon.png',
        badge: 'apple-touch-icon.png',
        tag: 'evlt-notif-' + (id || Date.now()),
        requireInteraction: false
      },
      fcmOptions: {
        link: destinationUrl
      }
    }
  };

  const response = await messaging.sendEachForMulticast(message);
  logger.info(`Push result: ${response.successCount} succeeded, ${response.failureCount} failed.`);

  // Clean up expired or unregistered tokens
  if (response.failureCount > 0) {
    const tokensToRemove = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          tokensToRemove.push(tokenKeys[idx]);
        }
      }
    });

    if (tokensToRemove.length > 0) {
      logger.info(`Removing ${tokensToRemove.length} obsolete tokens.`);
      for (const k of tokensToRemove) {
        await db.ref(`EVLT_PUSH_TOKENS/${k}`).remove().catch((e) => logger.warn(`Could not delete token ${k}:`, e));
      }
    }
  }

  return { sent: response.successCount, failed: response.failureCount };
}

/**
 * Database Trigger: Listens for newly written notifications in /EVLT_ADMIN_DB/notifications
 * Automatically triggers background Web Push to all devices.
 */
export const onNotificationWritten = onValueWritten(
  {
    ref: '/EVLT_ADMIN_DB/notifications',
    instance: 'evlt-admin-default-rtdb'
  },
  async (event) => {
    const beforeData = event.data.before.val() || [];
    const afterData = event.data.after.val() || [];

    const beforeIds = new Set(
      Array.isArray(beforeData)
        ? beforeData.map((n) => n?.id).filter(Boolean)
        : Object.keys(beforeData)
    );

    const newNotifications = [];
    if (Array.isArray(afterData)) {
      for (const item of afterData) {
        if (item && item.id && !beforeIds.has(item.id)) {
          newNotifications.push(item);
        }
      }
    } else if (typeof afterData === 'object' && afterData !== null) {
      for (const [key, item] of Object.entries(afterData)) {
        if (item && !beforeIds.has(key) && !beforeIds.has(item.id)) {
          newNotifications.push({ id: key, ...item });
        }
      }
    }

    if (newNotifications.length === 0) {
      return;
    }

    logger.info(`Detected ${newNotifications.length} new notification(s).`);
    for (const notif of newNotifications) {
      try {
        await broadcastPushNotification(notif);
      } catch (err) {
        logger.error(`Error sending push for notification ${notif.id}:`, err);
      }
    }
  }
);

/**
 * Database Trigger: Listens for new incidents logged in /EVLT_ADMIN_DB/incidents
 * Sends an automated high-priority push alert if enabled in automationSettings.
 */
export const onIncidentWritten = onValueWritten(
  {
    ref: '/EVLT_ADMIN_DB/incidents',
    instance: 'evlt-admin-default-rtdb'
  },
  async (event) => {
    const beforeData = event.data.before.val() || [];
    const afterData = event.data.after.val() || [];

    const beforeIds = new Set(
      Array.isArray(beforeData)
        ? beforeData.map((i) => i?.id).filter(Boolean)
        : Object.keys(beforeData)
    );

    const newIncidents = [];
    if (Array.isArray(afterData)) {
      for (const item of afterData) {
        if (item && item.id && !beforeIds.has(item.id)) {
          newIncidents.push(item);
        }
      }
    }

    if (newIncidents.length === 0) return;

    // Check automation settings
    const settingsSnap = await db.ref('EVLT_ADMIN_DB/automationSettings').once('value');
    const settings = settingsSnap.val() || {};
    if (settings.alertOnIncident === false) {
      logger.info('Incident push alerts disabled in automationSettings.');
      return;
    }

    for (const inc of newIncidents) {
      const title = '⚠️ Safety Defect / Incident Reported';
      const body = `${inc.type || 'Incident'}: ${inc.description || 'Details reported'} (${inc.location || 'Site'})`;
      const notifEntry = {
        id: 'notif-auto-inc-' + (inc.id || Date.now()),
        title,
        body,
        sentBy: 'Safety Automation',
        sentAt: new Date().toISOString(),
        isAutomated: true,
        type: 'incident'
      };

      // Append to notifications list so it shows in Notification Centre
      const notifsSnap = await db.ref('EVLT_ADMIN_DB/notifications').once('value');
      const currentList = Array.isArray(notifsSnap.val()) ? notifsSnap.val() : [];
      await db.ref('EVLT_ADMIN_DB/notifications').set([...currentList, notifEntry]);
    }
  }
);

/**
 * Scheduled Cron Function: Runs every 15 minutes.
 * - Dispatches scheduled notifications whose due date/time has passed.
 * - At 09:00 AM UK time, verifies daily track walk and upcoming events.
 */
export const scheduledOperationsCron = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Europe/London'
  },
  async () => {
    const now = new Date();
    const nowIso = now.toISOString();
    logger.info(`Running scheduledOperationsCron at ${nowIso}`);

    // 1. Process scheduled notifications
    try {
      const scheduledSnap = await db.ref('EVLT_ADMIN_DB/scheduled_notifications').once('value');
      const scheduledList = scheduledSnap.val();
      if (Array.isArray(scheduledList) && scheduledList.length > 0) {
        let updatedList = [...scheduledList];
        let hasChanges = false;
        const dueItems = [];

        updatedList = updatedList.map((item) => {
          if (item && !item.sent && item.scheduledFor && item.scheduledFor <= nowIso) {
            hasChanges = true;
            dueItems.push(item);
            return { ...item, sent: true, sentAt: nowIso };
          }
          return item;
        });

        if (hasChanges && dueItems.length > 0) {
          await db.ref('EVLT_ADMIN_DB/scheduled_notifications').set(updatedList);

          const notifsSnap = await db.ref('EVLT_ADMIN_DB/notifications').once('value');
          const currentNotifs = Array.isArray(notifsSnap.val()) ? notifsSnap.val() : [];
          const newEntries = dueItems.map((item) => ({
            id: 'notif-sched-' + item.id,
            title: item.title,
            body: item.body,
            sentBy: item.createdBy || 'Scheduled Alert',
            sentAt: nowIso,
            isAutomated: true
          }));

          await db.ref('EVLT_ADMIN_DB/notifications').set([...currentNotifs, ...newEntries]);
          logger.info(`Dispatched ${newEntries.length} scheduled notification(s).`);
        }
      }
    } catch (err) {
      logger.error('Error processing scheduled notifications:', err);
    }

    // 2. Daily morning safety and event checks (between 09:00 and 09:15 UK time)
    // Convert to UK local time parts
    const ukTimeStr = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false });
    const [ukHour, ukMin] = ukTimeStr.split(':').map(Number);

    if (ukHour === 9 && ukMin < 15) {
      const todayDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD
      const settingsSnap = await db.ref('EVLT_ADMIN_DB/automationSettings').once('value');
      const settings = settingsSnap.val() || {};

      // A) Daily Track Walk & Safety Inspection Check
      if (settings.remindDailyInspection !== false) {
        try {
          const checksSnap = await db.ref('EVLT_ADMIN_DB/dailyChecks').once('value');
          const checks = checksSnap.val() || {};
          const isDoneToday = checks.lastCheckDate === todayDateStr && checks.trackWalk && checks.trackWalk.result && checks.trackWalk.result !== 'Not Completed';

          // Check if we already alerted today
          const sentAlertKey = `inspection_alert_${todayDateStr}`;
          const alreadyAlertedSnap = await db.ref(`EVLT_AUTOMATION_LOGS/${sentAlertKey}`).once('value');

          if (!isDoneToday && !alreadyAlertedSnap.exists()) {
            await db.ref(`EVLT_AUTOMATION_LOGS/${sentAlertKey}`).set({ sentAt: nowIso });
            const notifsSnap = await db.ref('EVLT_ADMIN_DB/notifications').once('value');
            const currentNotifs = Array.isArray(notifsSnap.val()) ? notifsSnap.val() : [];
            const inspectionAlert = {
              id: 'notif-auto-track-' + todayDateStr,
              title: '🚂 Daily Inspection Reminder',
              body: "Morning track walk and daily safety checks have not yet been recorded for today.",
              sentBy: 'Safety Automation',
              sentAt: nowIso,
              isAutomated: true
            };
            await db.ref('EVLT_ADMIN_DB/notifications').set([...currentNotifs, inspectionAlert]);
            logger.info('Sent daily track walk inspection reminder.');
          }
        } catch (err) {
          logger.error('Error during daily inspection check:', err);
        }
      }

      // B) Today's Events Reminder
      if (settings.remindEvents !== false) {
        try {
          const eventsSnap = await db.ref('EVLT_ADMIN_DB/events').once('value');
          const eventsList = eventsSnap.val();
          if (Array.isArray(eventsList)) {
            const todayEvents = eventsList.filter((ev) => ev && ev.date === todayDateStr);
            const sentEventAlertKey = `events_alert_${todayDateStr}`;
            const alreadyAlertedSnap = await db.ref(`EVLT_AUTOMATION_LOGS/${sentEventAlertKey}`).once('value');

            if (todayEvents.length > 0 && !alreadyAlertedSnap.exists()) {
              await db.ref(`EVLT_AUTOMATION_LOGS/${sentEventAlertKey}`).set({ sentAt: nowIso });
              const eventNames = todayEvents.map((e) => e.name || e.title || 'Railway Event').join(', ');
              const notifsSnap = await db.ref('EVLT_ADMIN_DB/notifications').once('value');
              const currentNotifs = Array.isArray(notifsSnap.val()) ? notifsSnap.val() : [];
              const eventAlert = {
                id: 'notif-auto-event-' + todayDateStr,
                title: '📅 Event Today: ' + eventNames,
                body: `We have scheduled operations/events today at EVLT (${eventNames}). Please review the roster.`,
                sentBy: 'Operations Automation',
                sentAt: nowIso,
                isAutomated: true
              };
              await db.ref('EVLT_ADMIN_DB/notifications').set([...currentNotifs, eventAlert]);
              logger.info('Sent today events reminder.');
            }
          }
        } catch (err) {
          logger.error('Error during events check:', err);
        }
      }
    }
  }
);
