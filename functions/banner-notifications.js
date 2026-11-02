import { createHash } from 'node:crypto';

export const asList = value => Array.isArray(value) ? value.filter(Boolean) : Object.values(value || {}).filter(Boolean);
const norm = value => String(value || '').trim().toLowerCase();
const nameOf = v => v.Name || v.name || v['Volunteer Name'] || v['Volunteer ID'] || 'Unknown';
const iso = value => {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s.slice(0, 10);
};
export function londonTime(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, weekday: new Date(day + 'T12:00:00Z').getUTCDay(), minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
export function bannerEligible(b, account, data, now = new Date()) {
  if (b.active === false || !String(b.text || '').trim() || !['once', 'daily'].includes(b.notification?.mode)) return false;
  const t = londonTime(now), w = b.when || {}, aud = b.audience || {};
  if ((w.start && t.day < w.start) || (w.end && t.day > w.end)) return false;
  if (w.days?.length && !w.days.includes(t.weekday)) return false;
  const minutes = s => /^\d{2}:\d{2}$/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null;
  const from = minutes(w.timeFrom), to = minutes(w.timeTo);
  if (from !== null && to !== null) {
    if (from <= to ? t.minute < from || t.minute > to : t.minute < from && t.minute > to) return false;
  } else if ((from !== null && t.minute < from) || (to !== null && t.minute > to)) return false;
  const volunteers = asList(data.volunteers);
  const volunteer = volunteers.find(v => norm(nameOf(v)) === norm(account.volunteerName));
  const roles = String(volunteer?.Roles || volunteer?.roles || '').split(',').map(norm);
  const hasPage = page => account.isAdmin || account.grantedPages?.[page] === true || (Array.isArray(account.grantedPages) && account.grantedPages.includes(page));
  if (!account.isAdmin && !hasPage('dashboard')) return false;
  if ([...(aud.pages || []), ...(aud.roles || []), ...(aud.people || [])].length &&
      !(aud.pages || []).some(hasPage) && !(aud.roles || []).some(r => roles.includes(norm(r))) && !(aud.people || []).some(n => norm(n) === norm(account.volunteerName))) return false;
  const clocked = name => asList(data.clockLogs).some(l => l.status === 'Clocked In' && norm(l.name) === norm(name));
  const drivers = asList(data.clockLogs).filter(l => l.status === 'Clocked In' && volunteers.some(v => nameOf(v) === l.name && String(v.Roles || v.roles || '').includes('Driver'))).length;
  const actions = asList(data.actions).filter(a => (a.Status || 'Pending') !== 'Completed');
  const overdue = a => (a.DueDate || a.dueDate) && iso(a.DueDate || a.dueDate) < t.day;
  const incidents = asList(data.incidents).filter(i => norm(i.Status) !== 'resolved');
  const daily = data.dailyChecks?.lastCheckDate === t.day ? data.dailyChecks : {};
  const tests = {
    iAmClockedIn: () => clocked(account.volunteerName),
    iAmNotClockedIn: () => !clocked(account.volunteerName),
    fewDrivers: () => drivers < 2,
    overdueActions: () => actions.some(overdue),
    myOverdueActions: () => actions.some(a => overdue(a) && norm(a.AssignedTo || a.assignedTo) === norm(account.volunteerName)),
    openDefects: () => incidents.length > 0,
    redTagged: () => incidents.some(i => /red/i.test(String(i['Red Tag Status'] || '')) && !/^(no|none|n\/a|-)/i.test(String(i['Red Tag Status'] || '').trim())),
    trackWalkMissing: () => !daily.trackWalk?.result,
    testRunMissing: () => !daily.testRun?.result,
    eventToday: () => asList(data.events).some(e => { const start = iso(e.StartDate || e.startDate), end = iso(e.EndDate || e.endDate || e.StartDate || e.startDate); return start && start <= t.day && end >= t.day; }),
    openEnquiries: () => asList(data.enquiries).some(q => norm(q.status || 'Open') === 'open'),
    myLicenceExpiring: () => asList(data.volunteerDocs).some(d => {
      if (!d.expires || (!account.isAdmin && !account.editablePages?.documents && norm(d.volunteer) !== norm(account.volunteerName))) return false;
      const days = (new Date(iso(d.expires) + 'T00:00:00Z') - new Date(t.day + 'T00:00:00Z')) / 86400000;
      return Number.isFinite(days) && days <= 60;
    }),
    unreadNotifications: () => unreadFor(account, data).length > 0
  };
  // Unknown conditions fail closed rather than sending an unintended alert.
  return (w.conditions || []).every(key => tests[key] ? tests[key]() : false);
}
export function deliveryId(bannerId, uid, mode, now) {
  return createHash('sha256').update(JSON.stringify([bannerId, uid, mode === 'daily' ? londonTime(now).day : 'once'])).digest('hex');
}

function unreadFor(account, data) {
  const since = data.notificationReadTimes?.[account.uid] || '';
  return asList(data.notifications).filter(n => !n.unreadReminder && n.bannerId !== 'builtin:unread-notifications' &&
    (!Array.isArray(n.recipientUids) || n.recipientUids.includes(account.uid)) && (n.sentAt || '') > since);
}

// The banner editor supplies wording; these definitions provide the original defaults.
export const BUILTIN_NOTIFICATION_BANNERS = [
  ['my-overdue-actions', 'Your overdue actions', 'actions', 'You have {count} overdue action{s}: {list}'],
  ['my-due-soon-actions', 'Your actions due within 3 days', 'actions', '{count} action{s} assigned to you {is} due within 3 days: {list}'],
  ['other-overdue-actions', "Other people's overdue actions", 'actions', '{count} overdue action{s} not assigned to you: {list}'],
  ['my-defects', 'Open defects assigned to you', 'incidents', '{count} open defect{s} assigned to you: {list}'],
  ['red-tagged', 'Open red-tagged defects', 'incidents', '{count} open red-tagged defect{s}: {list}'],
  ['events-today', 'Event on today', 'events', 'Event on today: {list}'],
  ['events-soon', 'Events coming up (next 7 days)', 'events', 'Coming up: {list}'],
  ['daily-checks', 'Daily checks still to do', 'maintenance', 'Still to do today: {list} not recorded yet'],
  ['track-walk-failed', 'Track walk failed', 'maintenance', "Today's track walk was recorded as failed."],
  ['open-enquiries', 'Open enquiries', 'enquiries', 'Open enquiries waiting for a reply: {count}'],
  ['unread-notifications', 'Unread notifications', 'notifications', 'You have {count} unread notification{s}'],
  ['licence-alerts', 'Licence / certificate expiry', 'documents', '{count} expired or expiring licence{s} / certificate{s}: {list}'],
  ['driver-status', 'Qualified drivers on site', 'dashboard', '{count} qualified driver{s} currently on site. {list}']
];

export function getNotificationBanners(data) {
  return [...asList(data.customBanners), ...BUILTIN_NOTIFICATION_BANNERS.map(([key, title, page, text]) => ({
    ...(data.bannerSettings?.[key] || {}), id: 'builtin:' + key, builtinKey: key, title,
    text: String(data.bannerSettings?.[key]?.text || '').trim() || text, linkPage: page
  }))].filter(b => b.id && b.active !== false && ['once', 'daily'].includes(b.notification?.mode));
}

export function resolveNotificationBanner(b, account, data, now = new Date()) {
  if (!b.builtinKey) return b;
  const hasPage = p => account.isAdmin || account.grantedPages?.[p] === true || (Array.isArray(account.grantedPages) && account.grantedPages.includes(p));
  if (!hasPage(b.linkPage)) return null;
  const today = londonTime(now).day;
  const mine = value => norm(value) === norm(account.volunteerName);
  const due = a => iso(a.DueDate || a.dueDate);
  const daysAway = date => (new Date(date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000;
  const openActions = asList(data.actions).filter(a => (a.Status || 'Pending') !== 'Completed');
  const openDefects = asList(data.incidents).filter(i => norm(i.Status) !== 'resolved');
  const events = asList(data.events).map(e => ({ ...e, start: iso(e.StartDate || e.startDate), end: iso(e.EndDate || e.endDate || e.StartDate || e.startDate) })).filter(e => e.start);
  const daily = data.dailyChecks?.lastCheckDate === today ? data.dailyChecks : {};
  let rows = [], title = x => x.Title || x.title || 'Untitled', always = false;
  switch (b.builtinKey) {
    case 'my-overdue-actions': rows = openActions.filter(a => mine(a.AssignedTo || a.assignedTo) && due(a) && due(a) < today); break;
    case 'my-due-soon-actions': rows = openActions.filter(a => mine(a.AssignedTo || a.assignedTo) && due(a) && daysAway(due(a)) >= 0 && daysAway(due(a)) <= 3); break;
    case 'other-overdue-actions': rows = openActions.filter(a => !mine(a.AssignedTo || a.assignedTo) && due(a) && due(a) < today); break;
    case 'my-defects': rows = openDefects.filter(i => mine(i.assignedTo || i.AssignedTo)); title = i => i.asset || i.Description || 'Defect'; break;
    case 'red-tagged': rows = openDefects.filter(i => /red/i.test(String(i['Red Tag Status'] || '')) && !/^(no|none|n\/a|-)/i.test(String(i['Red Tag Status'] || '').trim())); title = i => i.asset || i.Description || 'Defect'; break;
    case 'events-today': rows = events.filter(e => today >= e.start && today <= e.end); break;
    case 'events-soon': rows = events.filter(e => daysAway(e.start) > 0 && daysAway(e.start) <= 7).sort((a, z) => a.start.localeCompare(z.start)); title = e => `${e.Title || e.title || 'Event'} (${e.start})`; break;
    case 'daily-checks':
      if (!daily.trackWalk?.result) rows.push('track walk');
      if (asList(daily.runningTrains).length && !daily.testRun?.result) rows.push('test run');
      title = value => value; break;
    case 'track-walk-failed': rows = daily.trackWalk?.result === 'Fail' ? ['track walk'] : []; break;
    case 'open-enquiries': rows = asList(data.enquiries).filter(q => norm(q.status || 'Open') === 'open'); break;
    case 'unread-notifications': rows = unreadFor(account, data); break;
    case 'licence-alerts':
      rows = asList(data.volunteerDocs).filter(d => d.expires && (account.isAdmin || account.editablePages?.documents || mine(d.volunteer)) && Number.isFinite(daysAway(iso(d.expires))) && daysAway(iso(d.expires)) <= 60);
      title = d => `${d.volunteer} — ${d.title || d.type || 'Certificate'} (${iso(d.expires)})`; break;
    case 'driver-status': {
      const volunteers = asList(data.volunteers);
      rows = asList(data.clockLogs).filter(l => l.status === 'Clocked In' && volunteers.some(v => nameOf(v) === l.name && String(v.Roles || v.roles || '').includes('Driver')));
      title = l => l.name; always = true; break;
    }
    default: return null;
  }
  if (!rows.length && !always) return null;
  const list = b.builtinKey === 'driver-status'
    ? rows.length < 2 ? 'A minimum of 2 drivers is required for operations.' : 'Safety requirement met.'
    : rows.slice(0, 3).map(title).join(', ') + (rows.length > 3 ? ` and ${rows.length - 3} more` : '');
  return { ...b, text: b.text.replace(/\{count\}/g, String(rows.length)).replace(/\{s\}/g, rows.length === 1 ? '' : 's').replace(/\{is\}/g, rows.length === 1 ? 'is' : 'are').replace(/\{list\}/g, () => list) };
}

