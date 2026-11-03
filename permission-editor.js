let evltRolePermissionsDirty=false,evltRoleEditor=null,evltRoleSaving=false;
function evltRoleKey(){return 'evlt-role-editor-'+evltPageKey();}
function evltRoleSelection(){try{return localStorage.getItem(evltRoleKey())||'';}catch{return '';}}
function evltRoleDraft(){try{return JSON.parse(sessionStorage.getItem(evltRoleKey())||'null');}catch{return null;}}
function evltRoleValues(){return Object.fromEntries(ACCOUNT_ACCESS_PAGES.map(p=>{const edit=document.querySelector('.role-page-edit[data-page="'+p.key+'"]')?.checked===true;return [p.key,{view:edit||document.querySelector('.role-page-view[data-page="'+p.key+'"]')?.checked===true,edit}];}));}
function evltRememberRoleDraft(){if(!evltRoleEditor||evltRoleSaving)return;evltRolePermissionsDirty=true;try{sessionStorage.setItem(evltRoleKey(),JSON.stringify({...evltRoleEditor,permissions:evltRoleValues()}));}catch{}const status=document.getElementById('rolePermissionSaveStatus');if(status)status.textContent='Unsaved changes. Save role permissions to apply them to linked accounts.';}
function evltClearRoleDraft(){evltRolePermissionsDirty=false;try{sessionStorage.removeItem(evltRoleKey());}catch{}}
function evltPrepareRoleEditor(role,permissions){
  evltRolePermissionsDirty=false;
  const draft=evltRoleDraft();evltRoleEditor={owner:evltPageKey(),role,expected:JSON.parse(JSON.stringify(permissions))};
  try{localStorage.setItem(evltRoleKey(),role);}catch{}
  if(draft?.owner===evltPageKey()&&draft.role===role){evltRoleEditor.expected=draft.expected;evltRolePermissionsDirty=true;for(const p of ACCOUNT_ACCESS_PAGES){const view=document.querySelector('.role-page-view[data-page="'+p.key+'"]'),edit=document.querySelector('.role-page-edit[data-page="'+p.key+'"]');if(view)view.checked=draft.permissions?.[p.key]?.view===true;if(edit)edit.checked=draft.permissions?.[p.key]?.edit===true;}const status=document.getElementById('rolePermissionSaveStatus');if(status)status.textContent='Your unsaved permission changes were recovered. Review and save to apply them.';}
  document.getElementById('rolePermissionSettings')?.querySelectorAll('input[type=checkbox]').forEach(input=>input.addEventListener('change',evltRememberRoleDraft));
}
async function evltCallAccessSave(data){
  if(!navigator.onLine)throw new Error('You are offline. Reconnect and save again. Your changes have been kept.');
  if(!auth?.currentUser)throw new Error('Sign in again before saving.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('https://europe-west1-'+firebaseConfig.projectId+'.cloudfunctions.net/saveAccessSettings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data})});
  const body=await response.json();if(!response.ok||body.error||body.result?.saved!==true)throw new Error(body.error?.message||'The save could not be confirmed. Your changes have been kept.');return body.result;
}
async function evltSaveRole(){
  if(!currentUser?.isSystemAdmin||!evltRoleEditor||evltRoleSaving)return;
  const role=evltRoleEditor.role,owner=evltPageKey(),status=document.getElementById('rolePermissionSaveStatus');
  evltRememberRoleDraft();const permissions=evltRoleValues();evltRoleSaving=true;
  const controls=[...document.querySelectorAll('#rolePermissionSettings input,#rolePermissionSettings select,#rolePermissionSettings button')];controls.forEach(el=>el.disabled=true);if(status)status.textContent='Saving and checking linked account access…';
  try{const result=await evltCallAccessSave({kind:'role',role,permissions,expected:evltRoleEditor.expected});if(owner!==evltPageKey())return;db.rolePageAccess=result.rolePageAccess;rolePermissionsNeedMigration=false;evltClearRoleDraft();evltRoleSaving=false;renderRolePermissionSettings(role);renderPermissionAccountSummary();const saved=document.getElementById('rolePermissionSaveStatus');if(saved)saved.textContent='Saved to Firebase. Linked account access was updated in the same save.';}
  catch(error){if(status)status.textContent=error.message;evltToast(error.message,'error');}
  finally{evltRoleSaving=false;controls.forEach(el=>el.disabled=false);}
}
