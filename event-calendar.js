// RFC 5545 downloads: no external calendar account or service is contacted.
function evltCalendarEscape(value){return String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
function evltCalendarFold(line){let result='',part='',bytes=0;for(const character of line){const size=new TextEncoder().encode(character).length;if(bytes+size>75){result+=part+'\r\n';part=' ';bytes=1;}part+=character;bytes+=size;}return result+part;}
function evltCalendarDay(value){const iso=toISODate(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||'')||new Date(iso+'T00:00:00Z').toISOString().slice(0,10)!==iso)throw Error('This event needs a valid date before it can be added to a calendar.');return iso;}
function evltNextCalendarDay(day){return new Date(new Date(day+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10);}
function evltLondonUtc(day,time){
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))throw Error('This event has an invalid start or end time.');
  const [year,month,date]=day.split('-').map(Number),[hour,minute]=time.split(':').map(Number);const wall=Date.UTC(year,month-1,date,hour,minute);let utc=wall;
  const format=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  let parts;
  for(let pass=0;pass<4;pass++){parts=Object.fromEntries(format.formatToParts(new Date(utc)).map(p=>[p.type,p.value]));const actual=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute);const correction=wall-actual;if(!correction)return new Date(utc);utc+=correction;}
  throw Error('This time falls in the UK clock-change gap. Please correct the event time first.');
}
function evltBuildEventCalendar(event,index=0,now=new Date()){
  const start=evltCalendarDay(event.StartDate||event.startDate),end=evltCalendarDay(event.EndDate||event.endDate||start);if(end<start)throw Error('This event ends before it starts.');
  const stamp=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//EVLT Operations//Railway events//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT','UID:evlt-'+encodeURIComponent(String(event.id??index))+'@evlt-operations','DTSTAMP:'+stamp(now)];
  const timed=!!event.StartTime&&(!!event.EndTime||end===start);
  if(timed){const from=evltLondonUtc(start,event.StartTime);let until=event.EndTime?evltLondonUtc(end,event.EndTime):new Date(from.getTime()+3600000);if(until<=from&&end===start&&event.EndTime)until=evltLondonUtc(evltNextCalendarDay(end),event.EndTime);if(until<=from)throw Error('The event end time must be after the start time.');lines.push('DTSTART:'+stamp(from),'DTEND:'+stamp(until));}
  else lines.push('DTSTART;VALUE=DATE:'+start.replace(/-/g,''),'DTEND;VALUE=DATE:'+evltNextCalendarDay(end).replace(/-/g,''));
  lines.push('SUMMARY:'+evltCalendarEscape(event.Title||event.title||'EVLT event'));
  if(event.Location)lines.push('LOCATION:'+evltCalendarEscape(event.Location));
  const notes=[event.Description||event.desc,!timed&&event.StartTime?'Start time (UK): '+event.StartTime:'',event.AccessLevel,Array.isArray(event.Requirements)?event.Requirements.join(', '):'',event.Contact?'Contact: '+event.Contact:''].filter(Boolean).join('\n');if(notes)lines.push('DESCRIPTION:'+evltCalendarEscape(notes));
  lines.push('END:VEVENT','END:VCALENDAR');return lines.map(evltCalendarFold).join('\r\n')+'\r\n';
}
function evltDownloadEvent(index,expectedId=''){
  if(!userHasAccess('events')&&!userHasAccess('calendar'))return;
  if(expectedId)index=(db.events||[]).findIndex(event=>String(event?.id)===String(expectedId));
  const event=(db.events||[])[index];if(!event)return;
  try{const text=evltBuildEventCalendar(event,index);const url=URL.createObjectURL(new Blob([text],{type:'text/calendar;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='EVLT-'+String(event.Title||event.title||'event').replace(/[^a-z0-9]+/gi,'-').slice(0,60)+'.ics';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);evltToast('Calendar file downloaded. Open it to add the event to your calendar.');}catch(error){evltToast(error.message,'error');}
}
