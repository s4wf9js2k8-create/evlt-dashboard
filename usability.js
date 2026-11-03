// Shared interaction improvements. No account or permission decisions are made here.
let evltRefreshPending = false;
const evltDirtyForms = new WeakSet(), evltOpenDialogs = new Map();
const evltPageKey = () => String(auth?.currentUser?.uid || currentUser?.uid || currentUser?.email || '');
function evltStoredList(key) { try { const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]; } catch {return [];} }
function evltStoreList(key,value) {try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function evltPinnedPages(){return evltStoredList('evlt-pins-'+evltPageKey()).filter(p=>userHasAccess(p));}
function evltTogglePinned(page){
  if(!userHasAccess(page))return;
  const pages=evltPinnedPages();evltStoreList('evlt-pins-'+evltPageKey(),pages.includes(page)?pages.filter(p=>p!==page):[...pages,page].slice(-8));
  renderSidebar();evltEnhancePage(currentView);evltToast(pages.includes(page)?'Shortcut removed.':'Added to your shortcuts.');
}
function evltRecordPage(page){if(!currentUser)return;const key='evlt-recent-'+evltPageKey();evltStoreList(key,[page,...evltStoredList(key).filter(p=>p!==page)].slice(0,6));}
function evltPageDefinition(page){return ACCOUNT_ACCESS_PAGES.find(p=>p.key===page)||(page==='settings'?{key:'settings',label:'Settings & Permissions'}:null);}
function evltHasActiveWork(){
  if(!currentUser||!document.body.classList.contains('authenticated'))return false;
  const content=document.getElementById('content');if(content?.dataset.evltOwner!==evltPageKey())return false;
  if([...document.querySelectorAll('.modal-overlay')].some(el=>getComputedStyle(el).display!=='none'))return true;
  if(typeof evltRolePermissionsDirty!=='undefined'&&evltRolePermissionsDirty)return true;
  if(typeof loftDraft!=='undefined'&&loftDraft)return true;
  if(document.getElementById('itemCodeEditor')?.style.display==='block')return true;
  if([...content.querySelectorAll('form')].some(f=>evltDirtyForms.has(f)))return true;
  return !!document.activeElement?.matches('#content input:not([type=button]):not([type=submit]),#content textarea,#content select');
}
function evltDeferRefresh(){
  evltRefreshPending=true;
  let bar=document.getElementById('evltLiveUpdate');if(bar)return;
  bar=document.createElement('div');bar.id='evltLiveUpdate';bar.className='evlt-update-bar';bar.setAttribute('role','status');
  bar.innerHTML='<span>New data is available. Your current work has been kept.</span><button type="button" class="btn btn-secondary btn-sm" onclick="evltRefreshView()">Refresh view</button>';
  document.getElementById('content')?.prepend(bar);
}
function evltRefreshView(){
  if(evltHasActiveWork()&&!confirm('Refresh this view? Unsaved form changes will be discarded.'))return;
  if(typeof evltClearRoleDraft==='function')evltClearRoleDraft();
  evltRefreshPending=false;document.querySelectorAll('#content form').forEach(f=>evltDirtyForms.delete(f));
  if(typeof loftClearDraft==='function')loftClearDraft();
  navigate(currentView);
}
function evltToast(message,type='success'){
  let host=document.getElementById('evltToasts');if(!host){host=document.createElement('div');host.id='evltToasts';host.setAttribute('role','status');host.setAttribute('aria-live','polite');document.body.appendChild(host);}
  host.textContent=message;host.className='evlt-toast '+(type==='error'?'is-error':'');host.hidden=false;
  clearTimeout(evltToast.timer);evltToast.timer=setTimeout(()=>{host.hidden=true;},4500);
}
function evltShowFormMessage(form,message){
  if(!form)return;let box=form.querySelector('.evlt-form-message');if(!box){box=document.createElement('div');box.className='evlt-form-message';box.setAttribute('role','alert');box.tabIndex=-1;form.prepend(box);}
  box.textContent=message;box.focus();
}
function evltSyncMenu(open){
  const sidebar=document.getElementById('sidebar'),overlay=document.getElementById('overlay'),button=document.querySelector('.menu-btn');
  sidebar?.classList.toggle('active',open);overlay?.classList.toggle('active',open);button?.setAttribute('aria-expanded',String(open));
  button?.setAttribute('aria-controls','sidebar');document.body.classList.toggle('evlt-menu-open',open);
}
function evltSettingsJump(){
  if(currentView!=='settings'||document.getElementById('evltSettingsJump'))return;
  const definitions=[['My admin account','My account'],['Volunteer email sign-ups','Sign-ups'],['Access & Permissions','Permissions'],['Dashboard layout','Dashboard layout'],['Dashboard banners','Banners & alerts'],['Data exports','Backups']];
  const nav=document.createElement('nav');nav.id='evltSettingsJump';nav.className='evlt-settings-jump';nav.setAttribute('aria-label','Settings sections');
  definitions.forEach(([title,label],index)=>{const heading=[...document.querySelectorAll('#content h3')].find(h=>h.textContent.trim()===title);if(!heading)return;const section=heading.closest('.card');section.id='evlt-settings-'+index;section.classList.add('evlt-settings-section');const button=document.createElement('button');button.className='btn btn-secondary btn-sm';button.textContent=label;button.onclick=()=>section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});nav.appendChild(button);});
  document.querySelector('#content .page-header')?.after(nav);
}
function evltEnhancePage(page){
  const content=document.getElementById('content');if(!content||!currentUser)return;
  content.dataset.evltOwner=evltPageKey();evltRecordPage(page);evltSyncMenu(false);
  document.querySelectorAll('#sidebar a.active').forEach(a=>a.setAttribute('aria-current','page'));
  const definition=evltPageDefinition(page);let context=document.getElementById('evltPageTools');
  if(definition){if(!context){context=document.createElement('div');context.id='evltPageTools';context.className='evlt-page-tools';content.prepend(context);}const pinned=evltPinnedPages().includes(page);context.innerHTML=`<span>${escapeHtml(definition.section||'EVLT Operations')} / ${escapeHtml(definition.label)}</span><button type="button" class="btn btn-subtle btn-sm" aria-pressed="${pinned}" onclick="evltTogglePinned(${inlineJsArg(page)})">${pinned?'Unpin shortcut':'Pin shortcut'}</button>`;}
  evltSettingsJump();evltLabelFields();evltApplyViewOnly(page);evltStackActionTable(page);evltUpdateConnection(evltUpdateConnection.connected!==false);
}
function evltLabelFields(){
  document.querySelectorAll('.form-group').forEach(group=>{const label=group.querySelector('label:not([for])'),controls=group.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea');if(label&&controls.length===1){const control=controls[0];if(!control.id)control.id='evlt-field-'+(++evltLabelFields.next);label.htmlFor=control.id;}});
  document.querySelectorAll('button[title]:not([aria-label])').forEach(button=>{if(!button.textContent.trim())button.setAttribute('aria-label',button.title);});
}
evltLabelFields.next=0;
function evltStackActionTable(page){
  if(page!=='actions')return;
  const table=document.querySelector('#content table');if(!table)return;table.classList.add('evlt-stack-table');table.setAttribute('role','table');
  const headings=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());table.querySelectorAll('tr').forEach(tr=>tr.setAttribute('role','row'));table.querySelectorAll('thead th').forEach(th=>th.setAttribute('role','columnheader'));
  table.querySelectorAll('tbody tr').forEach(tr=>{[...tr.children].forEach((td,index)=>{td.setAttribute('role','cell');td.dataset.label=td.colSpan>1?'':headings[index]||'';});});
  if(!canEditFeature('actions')){document.querySelector('#content [onclick="openActionModal()"]')?.remove();table.querySelectorAll('button[onclick^="toggleActionStatus"]').forEach(button=>{const text=document.createElement('span');text.textContent=button.textContent;button.replaceWith(text);});}
}
function evltApplyViewOnly(page){
  if(page!=='dashboard')return;
  if(!canEditFeature('incidents'))document.querySelector('#content [onclick="openIncidentModal()"]')?.remove();
  if(!canEditFeature('dashboard')){
    document.getElementById('newRunningTrainSelect')?.parentElement?.remove();
    document.querySelectorAll('#content button[onclick*="openOpCheckModal"],#content button[onclick*="removeRunningTrain"]').forEach(el=>el.remove());
    document.querySelectorAll('#content tr[onclick*="openOpCheckModal"]').forEach(el=>el.removeAttribute('onclick'));
  }
}
function evltUpdateConnection(connected){
  let bar=document.getElementById('evltConnection');if(!bar){bar=document.createElement('div');bar.id='evltConnection';bar.setAttribute('role','status');document.querySelector('header')?.after(bar);}
  const offline=!navigator.onLine;bar.hidden=!currentUser||(!offline&&connected);bar.textContent=offline?'You are offline. Reconnect before saving changes.':'Reconnecting to EVLT… your current work is still here.';bar.className=offline?'evlt-connection is-offline':'evlt-connection';
}
function evltVisibleDialog(){return [...document.querySelectorAll('.modal-overlay')].reverse().find(el=>getComputedStyle(el).display!=='none');}
function evltWatchDialogs(){
  document.querySelectorAll('.modal-overlay').forEach(overlay=>{
    const shown=getComputedStyle(overlay).display!=='none';
    if(shown&&!evltOpenDialogs.has(overlay)){
      const modal=overlay.querySelector('.modal')||overlay.firstElementChild;if(!modal)return;
      const title=modal.querySelector('h2,h3');if(title&&!title.id)title.id=overlay.id+'-heading';
      modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');if(title)modal.setAttribute('aria-labelledby',title.id);modal.tabIndex=-1;
      evltOpenDialogs.set(overlay,document.activeElement);
      const focus=modal.querySelector('input:not([type=hidden]):not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled])')||modal;setTimeout(()=>{if(getComputedStyle(overlay).display!=='none'&&!modal.contains(document.activeElement))focus.focus();},0);
    }else if(!shown&&evltOpenDialogs.has(overlay)){const previous=evltOpenDialogs.get(overlay);evltOpenDialogs.delete(overlay);overlay.querySelectorAll('form').forEach(f=>evltDirtyForms.delete(f));if(previous?.isConnected&&(!document.activeElement||document.activeElement===document.body||overlay.contains(document.activeElement)))previous.focus();}
  });
}
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelector('.menu-btn')?.setAttribute('aria-expanded','false');
  document.addEventListener('input',event=>{const form=event.target.closest('form');if(form&&event.target.type!=='password')evltDirtyForms.add(form);});
  document.addEventListener('invalid',event=>{const input=event.target,form=input.form;if(!form)return;const label=document.querySelector('label[for="'+CSS.escape(input.id)+'"]')?.textContent.trim()||input.getAttribute('aria-label')||'this field';evltShowFormMessage(form,'Please check '+label.toLowerCase()+'. '+input.validationMessage);input.setAttribute('aria-invalid','true');},true);
  document.addEventListener('input',event=>{event.target.removeAttribute('aria-invalid');const form=event.target.form;const box=form?.querySelector('.evlt-form-message');if(box)box.remove();});
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&currentUser){event.preventDefault();openGlobalSearchModal();return;}
    const overlay=evltVisibleDialog();
    if(event.key==='Escape'){if(overlay){if(overlay.querySelector('form[data-evlt-saving="true"]')){evltToast('Please wait for the save confirmation.');return;}if([...overlay.querySelectorAll('form')].some(f=>evltDirtyForms.has(f))&&!confirm('Close this form and discard your unsaved changes?'))return;closeModal(overlay.id);event.preventDefault();}else evltSyncMenu(false);return;}
    if(event.key==='Tab'&&overlay){const focusable=[...overlay.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){last.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}}
  });
  new MutationObserver(records=>{if(records.some(r=>r.type==='childList')){evltLabelFields();if(currentUser&&(document.getElementById('content')?.dataset.evltOwner!==evltPageKey()||!document.getElementById('evltPageTools')))evltEnhancePage(currentView);}evltWatchDialogs();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
  const connection=()=>evltUpdateConnection(evltUpdateConnection.connected!==false);window.addEventListener('offline',connection);window.addEventListener('online',connection);
  window.addEventListener('resize',()=>{if(innerWidth>768)evltSyncMenu(false);});
  if(database)database.ref('.info/connected').on('value',snap=>{evltUpdateConnection.connected=snap.val()===true;connection();});
});

let evltOnlyUnmapped=false,evltItemResults=[],evltFiltersExpanded=null;
function evltToggleUnmapped(){evltOnlyUnmapped=!evltOnlyUnmapped;renderItemCodeRegister();}
function evltRenderItemExtras(sorted,records){
  evltItemResults=sorted;
  const table=document.querySelector('.item-register-table');if(!table)return;
  const toolbar=document.querySelector('.item-register-toolbar'),sort=document.querySelector('.item-register-sort'),filters=document.querySelector('.item-register-filter-bar');
  if(toolbar&&sort&&filters){const panel=document.createElement('details');panel.className='evlt-item-filter-panel';panel.open=evltFiltersExpanded??(innerWidth>768||!!itemCodeCategoryFilter||!!itemCodeLocationFilter);panel.innerHTML='<summary>Filters &amp; sorting</summary>';panel.append(sort,filters);panel.addEventListener('toggle',()=>{evltFiltersExpanded=panel.open;});toolbar.after(panel);}
  const card=table.closest('.card');card.classList.add('evlt-item-table');
  const mapped=records.filter(getItemLoftLink).length,canEdit=canEditFeature('documents');
  const tools=document.createElement('div');tools.className='evlt-item-tools';tools.innerHTML=`<button type="button" class="btn ${evltOnlyUnmapped?'btn-primary':'btn-secondary'} btn-sm" aria-pressed="${evltOnlyUnmapped}" onclick="evltToggleUnmapped()">Needs a map section (${records.length-mapped})</button><button type="button" class="btn btn-secondary btn-sm" onclick="evltExportItems()" ${sorted.length?'':'disabled'}>Export visible items</button><button type="button" class="btn btn-secondary btn-sm" onclick="evltPrintItemLabels()" ${sorted.length?'':'disabled'}>Print item labels</button>`;
  card.before(tools);const note=document.createElement('p');note.className='evlt-summary-note';note.textContent=`Showing ${sorted.length} of ${records.length} items · ${mapped} assigned to loft-map sections.`;card.before(note);
  const mobile=document.createElement('div');mobile.className='evlt-mobile-item-cards';
  mobile.innerHTML=sorted.length?sorted.map(item=>`<article class="card evlt-item-card"><code>${escapeHtml(item.itemCode)}</code><h3>${escapeHtml(item.itemName)}</h3><p>${getItemLoftLink(item)?`<button class="loft-location-link" onclick="showItemOnLoftMap(${inlineJsArg(item.id)})">${escapeHtml(getItemStorageLocation(item))} — show on map</button>`:escapeHtml(item.location||'No location set')}</p><p>${escapeHtml(item.category||'Uncategorised')}</p>${item.notes?'<p>'+escapeHtml(item.notes)+'</p>':''}<div class="evlt-card-actions">${canEdit?`<button type="button" class="btn btn-secondary btn-sm" onclick="openItemCodeForm(${inlineJsArg(item.id)})">Edit item</button>`:''}<button type="button" class="btn btn-secondary btn-sm" onclick="evltCopyItemLocation(${inlineJsArg(item.id)})">Copy location</button></div></article>`).join(''):'<div class="card evlt-item-empty"><strong>No items match</strong><p>Change the search or filters to see more items.</p><button class="btn btn-secondary" onclick="itemCodeSearch=\'\';evltOnlyUnmapped=false;clearItemCodeFilters()">Clear all filters</button></div>';
  card.after(mobile);
  if(!canEdit){document.querySelectorAll('[onclick^="openItemCodeForm"],[onclick^="deleteItemCode"]').forEach(el=>el.remove());}
}
function evltExportItems(){
  const safe=value=>/^[=+\-@\t\r]/.test(String(value||''))?"'"+value:value;
  const rows=evltItemResults.map(item=>Object.fromEntries(Object.entries({...item,location:getItemStorageLocation(item)}).map(([k,v])=>[k,typeof v==='string'?safe(v):v])));
  exportArrayToCsv('EVLT-items-'+getTodayString()+'.csv',rows,[{key:'itemCode',label:'Item code'},{key:'itemName',label:'Item'},{key:'location',label:'Storage location'},{key:'category',label:'Category'},{key:'notes',label:'Notes'}]);
}
function evltPrintItemLabels(){
  if(!evltItemResults.length)return;
  document.getElementById('print-area').innerHTML='<h1>EVLT item labels</h1><p>'+escapeHtml(formatDisplayDate(getTodayString()))+'</p><div class="evlt-print-label-grid">'+evltItemResults.map(i=>'<div class="evlt-print-label"><strong>'+escapeHtml(i.itemCode)+'</strong><h2>'+escapeHtml(i.itemName)+'</h2><p>'+escapeHtml(getItemStorageLocation(i))+'</p><small>'+escapeHtml(i.category||'')+'</small></div>').join('')+'</div>';
  window.print();
}
async function evltCopyItemLocation(id){const item=(db.itemCodes||[]).find(i=>String(i.id)===String(id));if(!item)return;try{await navigator.clipboard.writeText(getItemStorageLocation(item));evltToast('Storage location copied.');}catch{evltToast('Could not copy. Select the location text to copy it.','error');}}
function evltShowItemDetails(id,code=''){
  const host=document.getElementById('itemCodeEditor');if(!host)return;
  const item=(db.itemCodes||[]).find(i=>String(i.id)===String(id));host.style.display='block';
  host.innerHTML=item?`<h3>${escapeHtml(item.itemName)}</h3><p><code>${escapeHtml(item.itemCode)}</code></p><p class="evlt-summary-note">${escapeHtml(getItemStorageLocation(item))} · ${escapeHtml(item.category)}</p><p>${escapeHtml(item.notes||'')}</p><button type="button" class="btn btn-secondary" onclick="closeItemCodeForm()">Close item details</button>`:`<h3>Item not registered</h3><p class="evlt-summary-note">${escapeHtml(code)} does not match a registered item. Ask someone with Documents editing access to add it.</p><button type="button" class="btn btn-secondary" onclick="closeItemCodeForm()">Close</button>`;
  host.scrollIntoView({block:'start'});
}
