const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function setup(db, values = {}) {
  const fields = Object.fromEntries(Object.entries(values).map(([id,value]) => [id,{value}]));
  const messages=[], closed=[], toasts=[], writes=[];
  const form={dataset:{}, elements:[{disabled:false},{disabled:true}], nodes:[],
    querySelectorAll(){return this.nodes.slice();}, prepend(node){this.nodes.push(node);}, setAttribute(){}, removeAttribute(){}};
  const document={getElementById:id=>fields[id], querySelectorAll:()=>[], createElement:()=>({setAttribute(){},remove(){form.nodes=form.nodes.filter(n=>n!==this);}})};
  const ctx=vm.createContext({db,document,navigator:{onLine:true},database:{},console,
    toISODate:v=>v||'',getTodayString:()=> '2026-11-09', evltPageKey:()=> 'owner',evltDirtyForms:new WeakSet(),
    evltShowFormMessage:(_form,message)=>messages.push(message),evltToast:message=>toasts.push(message),
    dbUpdate:async updates=>{writes.push(plain(updates));return true;},
    canEditFeature:()=>true,closeModal:id=>closed.push(id),renderDashboard(){},renderArchives(){},renderCalendarView(){},renderClockLogsPage(){},
    currentView:'calendar',currentUser:{name:'Alex'},alert:message=>messages.push(message),
    COACHES_VALUE:'coaches',EVLTAssignments:{expandAssets:values=>values}, fleetItems:[]});
  const slices=[['      function prepareArchiveUpdates(', '      function exportArrayToCsv('],
    ['      function syncArchiveForDate(', '      function syncAllArchives('],
    ['      function shiftTimeLabel(', '      function openEditClockLogModal('],
    ['      async function saveClockLogShiftEdit(', '      function deleteClockLog('],
    ['      async function saveOpCheck(', '      function toggleOpCheckReason('],
    ['      function archiveRunningTrains(', '      function renderArchives('],
    ['      async function saveArchiveEdit(', '      function deleteArchiveDay(']];
  for(const [start,end] of slices)vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),ctx);
  return {ctx,form,fields,messages,closed,toasts,writes,event:{preventDefault(){},currentTarget:form}};
}
const shiftValues={editClockLogId:'1',editClockLogName:'Alex',editClockLogDate:'2026-11-09',editClockLogIn:'09:00',editClockLogOut:'17:00'};
test('hours wait for acknowledgement, reject duplicate clicks, then confirm and close',async()=>{
  const db={clockLogs:[{id:1,name:'Alex',date:'2026-11-09',clockIn:'09:00',clockOut:'12:00'}]};
  const f=setup(db,shiftValues);let resolve,count=0;
  f.ctx.dbUpdate=updates=>{count++;f.writes.push(plain(updates));return new Promise(r=>resolve=r);};
  const pending=f.ctx.saveClockLogShiftEdit(f.event);
  assert.equal(f.form.dataset.evltSaving,'true');
  assert.match(f.form.nodes[0].textContent,/Saving/);
  assert.equal(f.form.elements[0].disabled,true);
  assert.equal(db.clockLogs[0].clockOut,'12:00');
  assert.deepEqual(f.closed,[]);
  await f.ctx.saveClockLogShiftEdit(f.event);assert.equal(count,1);
  resolve(true);await pending;
  assert.equal(db.clockLogs[0].clockOut,'17:00');
  assert.deepEqual(f.closed,['editClockLogModal']);
  assert.deepEqual(f.toasts,['Changes saved.']);
  assert.equal(f.form.elements[0].disabled,false);assert.equal(f.form.elements[1].disabled,true);
  assert.equal(f.form.dataset.evltSaving,undefined);
});
test('failed hours save retains entry and source records; retry saves once',async()=>{
  const db={clockLogs:[{id:1,name:'Alex',date:'2026-11-09',clockIn:'09:00',clockOut:'12:00'}]};
  const f=setup(db,shiftValues);f.ctx.dbUpdate=async()=>false;
  await f.ctx.saveClockLogShiftEdit(f.event);
  assert.equal(db.clockLogs[0].clockOut,'12:00');assert.equal(db.historicalArchive,undefined);
  assert.equal(f.fields.editClockLogOut.value,'17:00');assert.deepEqual(f.closed,[]);assert.deepEqual(f.toasts,[]);
  assert.match(f.messages[0],/entry is still here/);assert.equal(f.form.elements[0].disabled,false);
  f.ctx.dbUpdate=async()=>true;await f.ctx.saveClockLogShiftEdit(f.event);
  assert.equal(db.clockLogs.length,1);assert.equal(db.clockLogs[0].clockOut,'17:00');
});
test('offline saves and unexpected exceptions retain the form and unlock it',async()=>{
  const f=setup({},{});f.ctx.navigator.onLine=false;
  assert.equal(await f.ctx.saveOperationalForm(f.form,{clockLogs:[]}),false);assert.equal(f.writes.length,0);
  f.ctx.navigator.onLine=true;f.ctx.dbUpdate=async()=>{throw new Error('test disconnect');};f.ctx.console={error(){}};
  assert.equal(await f.ctx.saveOperationalForm(f.form,{clockLogs:[]}),false);
  assert.equal(f.form.dataset.evltSaving,undefined);assert.equal(f.form.elements[0].disabled,false);assert.deepEqual(f.closed,[]);
});
test('daily check failures keep live checks and archive unchanged; success saves both together',async()=>{
  const db={dailyChecks:{lastCheckDate:'2026-11-09',trackWalk:{result:'Pass'},runningTrains:['Edward']},historicalArchive:[]};
  const f=setup(db,{opCheckKey:'testRun',opCheckInspector:'Alex',opCheckResult:'Fail',opCheckReason:'Brake issue',opCheckLocoSelect:'George'});
  f.ctx.dbUpdate=async()=>false;const before=JSON.stringify(db);
  await f.ctx.saveOpCheck(f.event);assert.equal(JSON.stringify(db),before);assert.deepEqual(f.closed,[]);
  f.ctx.dbUpdate=async updates=>{f.writes.push(plain(updates));return true;};await f.ctx.saveOpCheck(f.event);
  assert.deepEqual(f.writes[0].dailyChecks.testRun.trains,['George']);
  assert.deepEqual(f.writes[0].historicalArchive[0].runningTrains,['Edward']);
  assert.equal(f.writes[0].historicalArchive[0].testRun.notes,'Brake issue');assert.deepEqual(f.closed,['opCheckModal']);
});
test('archive edits target dates after reordering and save tested/running selections independently',async()=>{
  const db={historicalArchive:[{date:'2026-11-09',note:'Keep other day'},{date:'2026-11-08',testRun:{recordedBy:'Original',trains:['George']},runningTrains:['Edward']}],fleetItems:[]};
  const f=setup(db,{editArchiveDate:'2026-11-08',editArchiveIndex:'0',editArch_TW_Result:'Pass',editArch_TW_Inspector:'Alex',editArch_TW_Notes:'',editArch_TR_Result:'Pass',editArch_TR_Inspector:'Alex',editArch_TR_Notes:'Original check'});
  f.ctx.document.querySelectorAll=selector=>selector==='.editArch-tested-loco:checked'?[{value:'George'}]:selector==='.editArch-loco:checked'?[{value:'Edward'}]:[];
  f.ctx.dbUpdate=async()=>false;const before=JSON.stringify(db);await f.ctx.saveArchiveEdit(f.event);
  assert.equal(JSON.stringify(db),before);assert.deepEqual(f.closed,[]);
  f.ctx.dbUpdate=async updates=>{f.writes.push(plain(updates));return true;};await f.ctx.saveArchiveEdit(f.event);
  const saved=f.writes[0].historicalArchive.find(a=>a.date==='2026-11-08');
  assert.deepEqual(saved.testRun.trains,['George']);assert.deepEqual(saved.runningTrains,['Edward']);
  assert.equal(saved.testRun.recordedBy,'Original');assert.equal(saved.testRun.notes,'Original check');
  assert.equal(f.writes[0].historicalArchive[0].note,'Keep other day');
  f.ctx.document.querySelectorAll=()=>[];await f.ctx.saveArchiveEdit(f.event);
  assert.deepEqual(plain(db.historicalArchive[1].runningTrains),[]);assert.deepEqual(plain(db.historicalArchive[1].testRun.trains),[]);
});
test('duration previews show whole and partial hours, incomplete and invalid selections',()=>{
  const {ctx}=setup({});
  assert.equal(ctx.shiftDurationText('09:00','17:00'),'09:00–17:00 · 8 hours');
  assert.equal(ctx.shiftDurationText('09:00','10:05'),'09:00–10:05 · 1 hour 5 minutes');
  assert.match(ctx.shiftDurationText('09:00','05:00'),/must be after/);
  assert.match(ctx.shiftDurationText('09:00','-'),/Select clock-in/);
});

test('explicitly empty running list stays empty after Firebase omits empty arrays',()=>{
  const {ctx}=setup({});
  assert.deepEqual(plain(ctx.archiveRunningTrains({runningTrainsRecorded:true,testRun:{trains:['George']}})),[]);
  assert.deepEqual(plain(ctx.archiveRunningTrains({testRun:{trains:['Legacy train']}})),['Legacy train']);
});
