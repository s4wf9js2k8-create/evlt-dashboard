// Keep the server's local cache synchronized and explicitly fetch current data before validation.
// Aborting a transaction from an old cache never gives Firebase a chance to retry its latest value.
export async function checkedTransaction(ref,update){
  const listener=()=>{};ref.on('value',listener,()=>{});
  try{await ref.get();return await ref.transaction(update,undefined,false);}
  finally{ref.off('value',listener);}
}
