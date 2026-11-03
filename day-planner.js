// Calendar details and read-only planning tools use the existing Events and Attendance records.
function evltDayIso(value){const day=toISODate(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return '';const parsed=new Date(day+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===day?day:'';}
function evltEventRange(event){
  if(!event||typeof event!=='object')return null;
  const start=evltDayIso(event.StartDate||event.startDate),end=evltDayIso(event.EndDate||event.endDate||start);if(!start||!end||end<start)return null;
  const overnight=end===start&&/^\d\d:\d\d$/.test(event.StartTime||'')&&/^\d\d:\d\d$/.test(event.EndTime||'')&&event.EndTime<=event.StartTime;
  return {start,end:overnight?evltNextCalendarDay(end):end,overnight};
}
function evltEventsOnDay(events,day){const date=evltDayIso(day);if(!date)return [];return (events||[]).map((event,index)=>({event,index,range:evltEventRange(event)})).filter(({range})=>range&&date>=range.start&&date<=range.end).sort((a,b)=>String(a.event.StartTime||'').localeCompare(String(b.event.StartTime||''))||String(a.event.Title||a.event.title||'').localeCompare(String(b.event.Title||b.event.title||'')));}
function evltNextEventDate(events,day){const date=evltDayIso(day);if(!date)return '';return (events||[]).map(evltEventRange).filter(Boolean).map(range=>range.start>date?range.start:range.end>date?evltNextCalendarDay(date):'').filter(Boolean).sort()[0]||'';}
function evltEventTime(event,range){return event.StartTime&&event.EndTime?event.StartTime+' – '+event.EndTime+(range?.overnight?' (next day)':''):event.StartTime?'From '+event.StartTime:event.EndTime?'Until '+event.EndTime:'All day';}
function evltEventDetailsHtml(entry,print=false){
  const {event,index,range}=entry,title=event.Title||event.title||'Untitled event',requirements=Array.isArray(event.Requirements)?event.Requirements.filter(Boolean):event.Requirements?[event.Requirements]:[];
  const facts=[['Time',evltEventTime(event,range)],['Dates',formatDisplayDate(range.start)+(range.end!==range.start?' – '+formatDisplayDate(range.end):'')],['Location',event.Location||event.location],['Event type',event.EventType],['Access',event.AccessLevel],['Contact',event.Contact]];
  return '<article class="evlt-day-event"><h4>'+escapeHtml(title)+'</h4><dl>'+facts.filter(([,value])=>value).map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+escapeHtml(value)+'</dd></div>').join('')+'</dl>'+
    ((event.Description||event.desc)?'<p class="evlt-event-description">'+escapeHtml(event.Description||event.desc)+'</p>':'')+
    (requirements.length?'<div class="evlt-event-requirements"><strong>What to bring / requirements</strong><ul>'+requirements.map(value=>'<li>'+escapeHtml(value)+'</li>').join('')+'</ul></div>':'')+
    (!print?'<button type="button" class="btn btn-secondary btn-sm" onclick="evltDownloadEvent('+index+','+inlineJsArg(String(event.id??''))+')">Add to my calendar</button>':'')+'</article>';
}
function evltSelectedDayHtml(day){
  const entries=evltEventsOnDay(db.events,day),next=evltNextEventDate(db.events,day);
  return '<section class="card evlt-day-panel" id="calendarDayDetails" aria-labelledby="calendarDayHeading"><h3 id="calendarDayHeading" tabindex="-1">'+escapeHtml(formatDisplayDate(day))+' · Day details</h3><p class="evlt-day-summary">'+entries.length+' event'+(entries.length===1?'':'s')+' scheduled</p><div class="evlt-day-actions"><button type="button" class="btn btn-secondary btn-sm" onclick="evltCalendarToday()">Today</button>'+(next?'<button type="button" class="btn btn-secondary btn-sm" onclick="evltCalendarJump('+inlineJsArg(next)+')">Next date with events</button>':'')+'<button type="button" class="btn btn-secondary btn-sm" onclick="evltPrintDayBrief()">Print day brief</button></div>'+ (entries.length?entries.map(entry=>evltEventDetailsHtml(entry)).join(''):'<p class="evlt-day-empty">No events scheduled for this date. You can still review attendance and volunteer availability below.</p>')+'</section>';
}
function evltCalendarJump(day){if(!evltDayIso(day))return;calendarCurrentDate=new Date(day+'T12:00:00');selectCalendarDate(day);}
function evltCalendarToday(){evltCalendarJump(getTodayString());}
function evltShowSelectedDay(){const title=document.getElementById('calendarDayHeading');title?.focus({preventScroll:true});if(window.innerWidth<980)document.getElementById('calendarDayDetails')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
function evltDayBriefHtml(day){
  const entries=evltEventsOnDay(db.events,day),people=[...new Set((db.rotaSignups||[]).filter(r=>r.date===day).map(r=>r.name).filter(Boolean))];
  return '<h1>EVLT day brief · '+escapeHtml(formatDisplayDate(day))+'</h1><p>Prepared '+escapeHtml(new Date().toLocaleString('en-GB'))+' · Information may change after printing.</p><h2>Events</h2>'+(entries.length?entries.map(entry=>evltEventDetailsHtml(entry,true)).join(''):'<p>No events scheduled.</p>')+'<h2>Volunteer availability ('+people.length+')</h2>'+(people.length?'<ul>'+people.map(name=>'<li>'+escapeHtml(name)+'</li>').join('')+'</ul>':'<p>No availability recorded.</p>')+'<p>Availability is not a duty assignment. Use the existing qualification records and local operating procedures when allocating duties.</p>';
}
function evltPrintDayBrief(){
  if(!userHasAccess('calendar'))return;
  let overlay=document.getElementById('evltDayBriefModal');if(!overlay){overlay=document.createElement('div');overlay.id='evltDayBriefModal';overlay.className='modal-overlay';document.body.appendChild(overlay);}
  overlay.innerHTML='<div class="modal evlt-brief-modal" role="dialog" aria-modal="true" aria-label="Daily briefing preview"><h2 class="evlt-no-print" id="evltBriefPreviewTitle">Day briefing preview</h2><div class="evlt-brief-content">'+evltDayBriefHtml(selectedCalendarDateStr)+'</div><div class="modal-actions evlt-no-print"><button type="button" class="btn btn-secondary" onclick="evltCloseDayBrief()">Close</button><button type="button" class="btn btn-primary" onclick="evltPrintBriefDocument()">Print briefing</button></div></div>';
  overlay.style.display='flex';
}
function evltCloseDayBrief(){document.body.classList.remove('evlt-print-day');closeModal('evltDayBriefModal');}
function evltPrintBriefDocument(){if(!userHasAccess('calendar'))return;document.body.classList.add('evlt-print-day');window.addEventListener('afterprint',()=>document.body.classList.remove('evlt-print-day'),{once:true});try{window.print();}catch(error){document.body.classList.remove('evlt-print-day');evltToast('Printing is unavailable in this browser. You can still read the briefing here.','error');}}
let evltVolunteerFilters={search:'',role:'',status:''};
function evltVolunteerRecordStatus(docs){if(!docs.length)return 'none';const statuses=docs.map(volDocStatus);return statuses.some(s=>s.label==='Expired')?'expired':statuses.some(s=>s.label==='Expiring Soon')?'soon':'recorded';}
function evltVolunteerFilterMatch({name,roles,status},filters){return (!filters.search||[name,...roles].some(value=>value.toLowerCase().includes(filters.search.trim().toLowerCase())))&&(!filters.role||roles.includes(filters.role)||(filters.role==='Standard'&&!roles.length))&&(!filters.status||filters.status==='renewal'&&['expired','soon'].includes(status)||filters.status===status);}
function evltVolunteerMatches(volunteer,filters){const name=getVolunteerName(volunteer),roles=getVolunteerRoles(volunteer),docs=(db.volunteerDocs||[]).filter(d=>d.volunteer===name);return evltVolunteerFilterMatch({name,roles,status:evltVolunteerRecordStatus(docs)},filters);}
function evltVolunteerFilterHtml(){const roles=[...new Set((db.volunteers||[]).flatMap(v=>getVolunteerRoles(v).length?getVolunteerRoles(v):['Standard']))].sort();return '<details class="evlt-volunteer-filter-panel" '+((evltVolunteerFilters.role||evltVolunteerFilters.status||window.innerWidth>600)?'open':'')+'><summary>Filter by role or qualifications</summary><div class="evlt-volunteer-filters"><div><label for="volRoleFilter">Role</label><select id="volRoleFilter" onchange="filterVolunteersTable()"><option value="">All roles</option>'+roles.map(role=>'<option '+(role===evltVolunteerFilters.role?'selected ':'')+'value="'+escapeHtml(role)+'">'+escapeHtml(role)+'</option>').join('')+'</select></div><div><label for="volStatusFilter">Qualification records</label><select id="volStatusFilter" onchange="filterVolunteersTable()">'+[['','All records'],['renewal','Expired or expiring soon'],['expired','Expired records'],['soon','Expiring soon'],['none','No qualification records']].map(([value,label])=>'<option value="'+value+'" '+(value===evltVolunteerFilters.status?'selected':'')+'>'+label+'</option>').join('')+'</select></div><button type="button" class="btn btn-secondary btn-sm" onclick="evltResetVolunteerFilters()">Clear filters</button></div></details><p id="volFilterCount" role="status" aria-live="polite" class="evlt-filter-count"></p>';}
function evltResetVolunteerFilters(){evltVolunteerFilters={search:'',role:'',status:''};renderVolunteers();}
let evltRotaSaving=false;
async function evltSaveOwnAvailability(date,attending){
  if(!navigator.onLine)throw new Error('You are offline. Reconnect before saving availability.');
  if(!auth?.currentUser)throw new Error('Sign in again before saving availability.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('https://europe-west1-'+firebaseConfig.projectId+'.cloudfunctions.net/setMyAvailability',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data:{date,attending}})});
  const body=await response.json();if(!response.ok||body.error||body.result?.saved!==true)throw new Error(body.error?.message||'Availability could not be confirmed saved. Try again.');return body.result;
}
