const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(new URL('../app.js',`file://${__filename}`),'utf8');
function setup(outcome){
 let resolve, calls=0,closed=0,message='';
 const pending=new Promise(r=>resolve=r);
 const values={editClockLogId:'123',editClockLogName:'Alex',editClockLogDate:'2026-11-06',editClockLogIn:'09:00',editClockLogOut:'12:00'};
 const form={dataset:{},elements:[{disabled:false},{disabled:true}],setAttribute(){},removeAttribute(){}};
 const db={clockLogs:[{id:123,name:'Alex',date:'2026-11-05',clockIn:'10:00',clockOut:'11:00'}],historicalArchive:[{date:'2026-11-05',attendance:[{name:'Alex'}],trackWalk:{result:'Pass'}}]};
 let payload;
 const ctx=vm.createContext({console:{error(){}},document:{getElementById:id=>({value:values[id]})},db,canEditFeature:()=>true,toISODate:x=>x,alert(){},evltShowFormMessage:(_,text)=>message=text,dbUpdate:async data=>{calls++;payload=data;if(outcome==='throw')throw Error('network');return outcome==='pending'?pending:outcome;},closeModal:()=>closed++,currentView:'clockLogs',renderClockLogsPage(){}});
 vm.runInContext(source.slice(source.indexOf('      function syncArchiveForDate('),source.indexOf('      function syncAllArchives('))+source.slice(source.indexOf('      async function saveClockLogShiftEdit('),source.indexOf('      function deleteClockLog(')),ctx);
 return {ctx,db,form,resolve,save:()=>ctx.saveClockLogShiftEdit({preventDefault(){},target:form}),get closed(){return closed},get calls(){return calls},get message(){return message},get payload(){return payload}};
}
for(const outcome of [false,'throw'])test('rejected save retains editor, original data and control states: '+outcome,async()=>{
 const f=setup(outcome),before=JSON.stringify(f.db);await f.save();assert.equal(JSON.stringify(f.db),before);assert.equal(f.closed,0);assert.match(f.message,/Could not save/);assert.equal(f.form.dataset.evltSaving,undefined);assert.deepEqual(f.form.elements.map(e=>e.disabled),[false,true]);
});
test('pending save leaves display untouched and prevents duplicate submission',async()=>{
 const f=setup('pending'),before=JSON.stringify(f.db);const first=f.save();await f.save();assert.equal(f.calls,1);assert.equal(f.closed,0);assert.equal(JSON.stringify(f.db),before);assert.equal(f.form.dataset.evltSaving,'true');f.resolve(true);await first;assert.equal(f.closed,1);assert.equal(f.db.clockLogs[0].clockIn,'09:00');
});
test('confirmed moved shift updates both archive dates and preserves other archive fields',async()=>{
 const f=setup(true);await f.save();assert.equal(f.closed,1);assert.equal(f.db.historicalArchive.find(x=>x.date==='2026-11-05').attendance.length,0);assert.equal(f.db.historicalArchive.find(x=>x.date==='2026-11-05').trackWalk.result,'Pass');assert.equal(f.db.historicalArchive.find(x=>x.date==='2026-11-06').attendance[0].clockOut,'12:00');assert.deepEqual(Object.keys(f.payload).sort(),['clockLogs','historicalArchive']);
});
test('removed shift is not silently recreated',async()=>{const f=setup(true);f.db.clockLogs=[];await f.save();assert.equal(f.calls,0);assert.equal(f.closed,0);assert.match(f.message,/removed/);});
