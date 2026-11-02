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
    })
  };
  // Unread state exists only on the device; never guess it or send a self-triggering notification.
  return (w.conditions || []).every(key => tests[key] ? tests[key]() : false);
}
export function deliveryId(bannerId, uid, mode, now) {
  return createHash('sha256').update(JSON.stringify([bannerId, uid, mode === 'daily' ? londonTime(now).day : 'once'])).digest('hex');
}
