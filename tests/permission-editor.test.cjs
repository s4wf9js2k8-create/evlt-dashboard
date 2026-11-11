const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function editor(fetch){
  const memory=new Map(),status={textContent:''},controls=[{disabled:false}];
  const context=vm.createContext({navigator:{onLine:true},auth:{currentUser:{getIdToken:async()=> 'test-token'}},firebaseConfig:{projectId:'demo-evlt'},fetch,currentUser:{isSystemAdmin:true},evltPageKey:()=> 'admin',sessionStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},ACCOUNT_ACCESS_PAGES:[{key:'documents'}],document:{getElementById:()=>status,querySelector:()=>({checked:true}),querySelectorAll:()=>controls},evltToast:()=>{}});
  vm.runInContext(fs.readFileSync('permission-editor.js','utf8'),context);
  vm.runInContext("evltRoleEditor={owner:'admin',role:'Standard',expected:{}}",context);
  return {run:code=>vm.runInContext(code,context),memory,status,controls};
}
test('network failures keep the role draft and restore save controls',async()=>{
  const ctx=editor(async()=>{throw new TypeError('Load failed')});
  await ctx.run('evltSaveRole()');
  assert.match(ctx.status.textContent,/Cannot reach the Firebase access save service/);
  assert.match(ctx.status.textContent,/changes have been kept/);
  assert.equal(JSON.parse(ctx.memory.get('evlt-role-editor-admin')).permissions.documents.edit,true);
  assert.equal(ctx.controls[0].disabled,false);
  assert.equal(ctx.run('evltRoleSaving'),false);
});
test('HTML server errors explain the failure without exposing a JSON parsing error',async()=>{
  const ctx=editor(async()=>({ok:false,status:503,json:async()=>{throw new SyntaxError('Unexpected token <')}}));
  await ctx.run('evltSaveRole()');
  assert.match(ctx.status.textContent,/HTTP 503/);
  assert.ok(ctx.memory.has('evlt-role-editor-admin'));
});
test('server rejection is shown and only a confirmed save is accepted',async()=>{
  const ctx=editor(async()=>({ok:false,status:409,json:async()=>({error:{message:'Review the latest settings.'}})}));
  await assert.rejects(()=>ctx.run('evltCallAccessSave({})'),/Review the latest settings/);
  const unconfirmed=editor(async()=>({ok:true,status:200,json:async()=>({result:{}})}));
  await assert.rejects(()=>unconfirmed.run('evltCallAccessSave({})'),/could not be confirmed/);
  const saved=editor(async()=>({ok:true,status:200,json:async()=>({result:{saved:true}})}));
  assert.equal((await saved.run('evltCallAccessSave({})')).saved,true);
});
