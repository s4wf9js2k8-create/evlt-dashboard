// Pure transaction planner. Always operate on current server data, never a browser's whole database copy.
export const ACCESS_PAGES = ['dashboard','clock','calendar','clockLogs','memberVisits','incidents','competency','volunteers','actions','maintenance','events','bookings','equipment','eurotunnel','suppliers','enquiries','documents','notes','gallery','archives','notifications','myAccount','help'];
export function canonical(value) { if(value==null)return 'null';if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value); }
const nameOf=v=>String(v?.Name||v?.name||v?.['Volunteer Name']||v?.['Volunteer ID']||'Unknown');
const rolesOf=v=>String(v?.Roles||v?.roles||'').split(',').map(s=>s.trim()).filter(Boolean);
const key=s=>String(s||'').trim().toLowerCase();
export function normalPolicy(value){return Object.fromEntries(ACCESS_PAGES.map(page=>[page,{view:value?.[page]===true||value?.[page]?.view===true||value?.[page]?.edit===true,edit:value?.[page]?.edit===true}]));}
export function planAccessSave(source,caller,data,now){
  if(source?.EVLT_SYSTEM_ADMIN_UIDS?.[caller]!==true)throw new Error('permission-denied');
  const root=JSON.parse(JSON.stringify(source)),db=root.EVLT_ADMIN_DB||(root.EVLT_ADMIN_DB={});
  let oldName='',newName='';
  if(data.kind==='role'||data.kind==='deleteRole'){
    const role=String(data.role||'').trim();if(!role||role.length>80||/[.#$\[\]\/]/.test(role))throw new Error('invalid-argument');
    const policy=db.rolePageAccess||(db.rolePageAccess={});
    if(canonical(normalPolicy(policy[role]))!==canonical(normalPolicy(data.expected)))throw new Error('aborted');
    if(data.kind==='deleteRole'){
      if(role==='Standard')throw new Error('invalid-argument');
      delete policy[role];
      db.customRoles=(db.customRoles||[]).filter(r=>r!==role);
      db.removedRoles=[...new Set([...(db.removedRoles||[]),role])];
      for(const volunteer of Object.values(db.volunteers||{})){if(rolesOf(volunteer).includes(role))volunteer.Roles=rolesOf(volunteer).filter(r=>r!==role).join(', ')||'Standard';}
    }else policy[role]=normalPolicy(data.permissions);
  }else if(data.kind==='volunteer'){
    const entries=Array.isArray(db.volunteers)?db.volunteers.filter(Boolean):Object.values(db.volunteers||{}).filter(Boolean);
    const target=data.expected;
    const index=target?entries.findIndex(v=>canonical(v)===canonical(target)):-1;
    if(target&&index<0)throw new Error('aborted');
    newName=String(data.name||'').trim();if(!newName||newName.length>150)throw new Error('invalid-argument');
    if(entries.some((v,i)=>i!==index&&key(nameOf(v))===key(newName)))throw new Error('already-exists');
    const roles=Array.isArray(data.roles)?[...new Set(data.roles)]:[];
    if(roles.some(r=>typeof r!=='string'||!r||r.length>80||/[.#$\[\]\/]/.test(r)))throw new Error('invalid-argument');
    if(typeof data.dbs!=='string'||data.dbs.length>80)throw new Error('invalid-argument');
    oldName=target?nameOf(entries[index]):'';
    const profile={...(index<0?{}:entries[index]),Name:newName,Roles:roles.join(', ')||'Standard','DBS Status':data.dbs};
    if(index<0)entries.push(profile);else entries[index]=profile;
    db.volunteers=entries;
  }else throw new Error('invalid-argument');
  const volunteers=Array.isArray(db.volunteers)?db.volunteers:Object.values(db.volunteers||{});
  for(const binding of Object.values(root.EVLT_ACCOUNT_BINDINGS||{})){
    if(binding?.approved!==true)continue;
    if(oldName&&key(binding.volunteerName)===key(oldName))binding.volunteerName=newName;
    const person=volunteers.find(v=>v&&key(nameOf(v))===key(binding.volunteerName));
    const grantedPages={},editablePages={};
    for(const role of rolesOf(person)){const permissions=normalPolicy(db.rolePageAccess?.[role]);for(const page of ACCESS_PAGES){if(permissions[page].view)grantedPages[page]=true;if(permissions[page].edit)editablePages[page]=true;}}
    binding.grantedPages=grantedPages;binding.editablePages=editablePages;binding.permissionsVersion=2;
  }
  db.accessSavedAt=now;
  return root;
}
