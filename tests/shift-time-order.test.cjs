const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js','utf8');
function helpers() {
  const ctx = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('      function shiftTimeLabel('),source.indexOf('      function openEditClockLogModal(')),ctx);
  return ctx;
}
test('same-day times accept 9 AM to 5 PM and reject early, equal or invalid ends',()=>{
  const ctx=helpers();
  assert.equal(ctx.validShiftTimeOrder('09:00','17:00'),true);
  for(const end of ['05:00','09:00','-','25:00']) assert.equal(ctx.validShiftTimeOrder('09:00',end),false);
  assert.equal(ctx.shiftTimeLabel('17:00'),'17:00 (5:00 PM)');
  assert.equal(ctx.shiftTimeLabel('05:00'),'05:00 (5:00 AM)');
});
test('start changes disable earlier finishes, clear invalid selection and restore later options',()=>{
  const ctx=helpers();
  const end={value:'05:00',options:['','05:00','09:00','17:00'].map(value=>({value})),get selectedOptions(){return this.options.filter(o=>o.value===this.value);}};
  ctx.constrainShiftEnd({value:'09:00'},end);
  assert.equal(end.value,'');
  assert.equal(end.options[1].disabled,true);
  assert.equal(end.options[2].disabled,true);
  assert.equal(end.options[3].disabled,false);
  ctx.constrainShiftEnd({value:'04:00'},end);
  assert.equal(end.options[1].disabled,false);
});
test('save rejects invalid time order before changing records or writing',async()=>{
  const fields={editClockLogId:'1',editClockLogName:'Alex',editClockLogDate:'2026-11-09',editClockLogIn:'09:00',editClockLogOut:'05:00'};
  const ctx=helpers(); let message='';
  Object.assign(ctx,{document:{getElementById:id=>({value:fields[id]})},canEditFeature:()=>true,alert:text=>message=text,db:{clockLogs:[{id:1,clockIn:'09:00',clockOut:'17:00'}]},dbUpdate:()=>assert.fail('must not save')});
  vm.runInContext(source.slice(source.indexOf('      async function saveClockLogShiftEdit('),source.indexOf('      function deleteClockLog(')),ctx);
  await ctx.saveClockLogShiftEdit({preventDefault(){}});
  assert.match(message,/after clock-in/);
  assert.equal(ctx.db.clockLogs[0].clockOut,'17:00');
});
