// Apply one record change to the latest collection, without overwriting another user's work.
const evltEditSnapshots=new Map();
async function evltCheckedTransaction(ref,update){
  // Keep the value listener attached until commit. A one-off get may leave an empty transaction cache.
  let listener;
  try{
    await new Promise((resolve,reject)=>{listener=()=>resolve();ref.on('value',listener,reject);});
    if(typeof ref.get==='function')await ref.get();
    return await ref.transaction(update,undefined,false);
  }finally{if(listener)ref.off('value',listener);}
}
function evltCanonical(value){if(Array.isArray(value))return '['+value.map(evltCanonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+evltCanonical(value[k])).join(',')+'}';return JSON.stringify(value);}
function evltCaptureEdit(collection,record){evltEditSnapshots.set(evltPageKey()+':'+collection,record?JSON.parse(JSON.stringify(record)):null);}
function evltEditingRecord(collection){return evltEditSnapshots.get(evltPageKey()+':'+collection)||null;}
function evltIsModalSaving(id){return !!document.getElementById(id)?.querySelector('form[data-evlt-saving="true"]');}
function evltApplyRecordChange(value,change){
  const records=(Array.isArray(value)?value:Object.values(value||{})).filter(Boolean).slice();
  if(change.uniqueField&&change.mode==='upsert'){
    const candidate=String(change.record?.[change.uniqueField]||'').trim().toLowerCase();
    if(records.some(r=>String(r.id)!==String(change.target?.id)&&String(r[change.uniqueField]||'').trim().toLowerCase()===candidate))return undefined;
  }
  if(change.target){const target=change.target;const index=target.id!==undefined?records.findIndex(r=>String(r.id)===String(target.id)):records.findIndex(r=>evltCanonical(r)===evltCanonical(target));
    if(index<0||evltCanonical(records[index])!==evltCanonical(target))return undefined;
    if(change.mode==='remove')records.splice(index,1);else records[index]={...records[index],...change.record};
  }else{if(change.mode!=='upsert'||!change.record)return undefined;if(change.record.id!==undefined&&records.some(r=>String(r.id)===String(change.record.id)))return undefined;records.push(change.record);}
  return records;
}
async function evltCommitRecord(collection,change){
  const pages={historicalArchive:'archives',itemCodes:'documents',actions:'actions',events:'events',helpGuides:'help',notifications:'notifications',suppliers:'suppliers',enquiries:'enquiries',documents:'documents',notes:'notes'};
  if(!pages[collection]||!canEditFeature(pages[collection])){evltToast('You do not have editing access to these records.','error');return false;}
  const form=change.form,button=change.button;if(form?.dataset.evltSaving==='true')return false;
  if(!navigator.onLine){if(form)evltShowFormMessage(form,'You are offline. Your entry is still here; reconnect and save again.');else evltToast('You are offline. Nothing has been deleted.','error');return false;}
  const owner=evltPageKey(),controls=[...(form?.elements||[])].map(element=>({element,disabled:element.disabled}));if(form){form.dataset.evltSaving='true';form.setAttribute('aria-busy','true');}controls.forEach(({element})=>{element.disabled=true;});if(button)button.disabled=true;
  try{
    const result=await evltCheckedTransaction(database.ref('EVLT_ADMIN_DB/'+collection),value=>evltApplyRecordChange(value,change));
    if(!result.committed){const message=collection==='itemCodes'?'This item changed, or its code is already in use. Your entry has been kept. Review the latest register before saving again.':'This record changed while you were working. Your entry has been kept. Close and reopen it to review the latest version.';if(form)evltShowFormMessage(form,message);else evltToast('This record has changed or was already removed. Refresh the view and try again.','error');return false;}
    if(evltPageKey()!==owner)return false;
    const value=result.snapshot.val();db[collection]=Array.isArray(value)?value.filter(Boolean):Object.values(value||{}).filter(Boolean);
    evltEditSnapshots.delete(owner+':'+collection);evltToast(change.mode==='remove'?'Record removed.':'Changes saved.');return true;
  }catch(error){console.error('Record write failed:',{collection,code:error.code,message:error.message});if(form)evltShowFormMessage(form,'Could not save this record. Your entry is still here. Check your connection and access, then try again.');else evltToast('Could not remove this record. It has been kept. Check your connection and try again.','error');return false;}
  finally{if(form){delete form.dataset.evltSaving;form.removeAttribute('aria-busy');}controls.forEach(({element,disabled})=>{element.disabled=disabled;});if(button&&!controls.some(c=>c.element===button))button.disabled=false;}
}
function evltRenderHiddenGuides(){
  if(!canEditFeature('help'))return;
  const hidden=(db.helpGuides||[]).filter(g=>g.hidden===true);if(!hidden.length)return;
  const box=document.createElement('details');box.className='card';box.style.cssText='padding:1rem;margin-top:1rem';
  box.innerHTML='<summary style="cursor:pointer;font-weight:600;min-height:44px">Hidden guides ('+hidden.length+')</summary>'+hidden.map(g=>'<div class="evlt-day-entry"><strong>'+escapeHtml(g.title||'Untitled guide')+'</strong><button type="button" class="btn btn-secondary btn-sm" onclick="evltRestoreGuide('+inlineJsArg(g.id)+')">Restore guide</button></div>').join('');
  document.getElementById('content').appendChild(box);
}
async function evltRestoreGuide(id){const target=(db.helpGuides||[]).find(g=>String(g.id)===String(id));if(!target)return;if(await evltCommitRecord('helpGuides',{mode:'upsert',target,record:{...target,hidden:false}}))renderHelpPage();}
