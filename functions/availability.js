// Calendar viewers can set only their own availability, using their approved account link.
export function planOwnAvailability(source,uid,email,data){
  const binding=source?.EVLT_ACCOUNT_BINDINGS?.[uid];
  if(!binding||binding.approved!==true||binding.email!==email||binding.grantedPages?.calendar!==true||!String(binding.volunteerName||'').trim())throw new Error('permission-denied');
  const date=String(data?.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||typeof data.attending!=='boolean')throw new Error('invalid-argument');
  const root=JSON.parse(JSON.stringify(source)),db=root.EVLT_ADMIN_DB||(root.EVLT_ADMIN_DB={}),name=binding.volunteerName;
  const records=Object.values(db.rotaSignups||{}).filter(Boolean),mine=record=>record.date===date&&String(record.name||'').trim().toLowerCase()===name.trim().toLowerCase();
  db.rotaSignups=records.filter(record=>!mine(record));
  if(data.attending)db.rotaSignups.push({id:'rota-'+uid+'-'+date,date,name});
  return root;
}
