// Pure preparation makes personal summaries easy to verify without live records.
function evltDaySummary(data,user,canView,today){
  const norm=value=>String(value||'').trim().toLowerCase();
  const actions=canView('actions')?(data.actions||[]).filter(a=>!['completed','cancelled'].includes(norm(a.Status||a.status))&&norm(a.AssignedTo||a.assignedTo)===norm(user.name)).sort((a,b)=>String(toISODate(a.DueDate||a.dueDate)||'9999').localeCompare(String(toISODate(b.DueDate||b.dueDate)||'9999'))):[];
  const upcoming=canView('events')?(data.events||[]).map(e=>({...e,start:toISODate(e.StartDate||e.startDate),end:toISODate(e.EndDate||e.endDate||e.StartDate||e.startDate)})).filter(e=>e.start&&e.end>=today&&Math.round((new Date(e.start)-new Date(today))/86400000)<=7).sort((a,b)=>a.start.localeCompare(b.start)):[];
  return{actions,upcoming,overdue:actions.filter(a=>toISODate(a.DueDate||a.dueDate)&&toISODate(a.DueDate||a.dueDate)<today).length};
}
function evltMyDayHtml(){
  const summary=evltDaySummary(db,currentUser,userHasAccess,getTodayString());
  const links=[['clock','Clock in / out'],['actions','My actions'],['documents','Find an item'],['incidents','Incidents & defects']].filter(([key])=>userHasAccess(key));
  return `<section class="card evlt-my-day" data-dashboard-widget="myDay"><div class="evlt-day-heading"><div><h3>Your day</h3><p>${escapeHtml(currentUser.name||'Volunteer')} · ${escapeHtml(formatDisplayDate(getTodayString()))}</p></div><span class="tag">${summary.actions.length} open action${summary.actions.length===1?'':'s'}</span></div><div class="evlt-day-grid"><div><h4>Assigned to you</h4>${summary.actions.length?summary.actions.slice(0,3).map(a=>`<div class="evlt-day-entry"><strong>${escapeHtml(a.Title||a.title||'Untitled action')}</strong><span>${a.DueDate||a.dueDate?`Due ${escapeHtml(formatDisplayDate(a.DueDate||a.dueDate))}`:'No due date'}</span></div>`).join(''):`<p class="evlt-summary-note">${userHasAccess('actions')?'No open actions assigned to you.':'Your shortcuts are below.'}</p>`}${summary.overdue?`<p class="evlt-day-overdue">${summary.overdue} overdue — open Actions to review.</p>`:''}</div><div><h4>Coming up</h4>${summary.upcoming.length?summary.upcoming.slice(0,2).map(e=>`<div class="evlt-day-entry"><strong>${escapeHtml(e.Title||e.title||'Event')}</strong><span>${escapeHtml(formatDisplayDate(e.start))}${e.Location?' · '+escapeHtml(e.Location):''}</span></div>`).join(''):'<p class="evlt-summary-note">No upcoming events in your pages for the next seven days.</p>'}</div></div><div class="evlt-day-shortcuts">${links.map(([page,label])=>`<button type="button" class="btn btn-secondary btn-sm" onclick="${page==='documents'?'docsSubView=\'items\';':page==='actions'?'actionsFilter=\'mine\';':''}navigate(${inlineJsArg(page)})">${label}</button>`).join('')}</div></section>`;
}
const evltLibraryLoads=new Map();
const evltScannerRequest={item:0,member:0};
function evltLoadScriptOnce(url,ready){
  if(ready())return Promise.resolve(true);
  if(evltLibraryLoads.has(url))return evltLibraryLoads.get(url);
  const task=new Promise(resolve=>{
    const script=document.createElement('script');script.src=url;script.async=true;
    const done=success=>{clearTimeout(timer);if(!success){evltLibraryLoads.delete(url);script.remove();}resolve(success);};
    const timer=setTimeout(()=>done(false),15000);script.onload=()=>done(ready());script.onerror=()=>done(false);document.head.appendChild(script);
  });
  evltLibraryLoads.set(url,task);return task;
}
async function evltLoadScannerLibraries(ocr=false){
  const tasks=[evltLoadScriptOnce('https://unpkg.com/@zxing/browser@0.2.1',()=>!!window.ZXingBrowser?.BrowserMultiFormatReader)];
  if(ocr)tasks.push(evltLoadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',()=>!!window.Tesseract));
  const results=await Promise.all(tasks);return results.some(Boolean);
}
async function evltLoadOcr(){return evltLoadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',()=>!!window.Tesseract);}
function evltReloadForNewDay(){if(evltHasActiveWork()&&!confirm('Reload for the new day? Save your current work first, or confirm to discard unsaved changes.'))return;location.reload();}
document.addEventListener('DOMContentLoaded',()=>{
  const openedDay=getTodayString();
  setInterval(()=>{if(!currentUser||getTodayString()===openedDay||document.getElementById('evltNewDay'))return;const bar=document.createElement('div');bar.id='evltNewDay';bar.className='evlt-update-bar';bar.setAttribute('role','status');bar.innerHTML='<span>A new day has started. Reload to load today’s checks and dates.</span><button type="button" class="btn btn-secondary btn-sm" onclick="evltReloadForNewDay()">Reload for today</button>';document.getElementById('content')?.prepend(bar);},60000);
});
