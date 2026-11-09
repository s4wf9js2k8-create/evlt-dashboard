const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
function setup(db) {
  const writes = [];
  const ctx = vm.createContext({ db, toISODate: v => v || '', getTodayString: () => '2026-11-09', dbUpdate: value => writes.push(JSON.parse(JSON.stringify(value))) });
  vm.runInContext(source.slice(source.indexOf('      function syncArchiveForDate('), source.indexOf('      function openModal(')), ctx);
  return {ctx, writes};
}
const daily = () => ({lastCheckDate:'2026-11-08', trackWalk:{result:'Pass',inspector:'Alex',notes:'Checked'},testRun:{result:'Fail',notes:'Brake issue',trains:['George']},runningTrains:['Edward']});
test('checks alone create an archive and snapshots do not share live references', () => {
  const db = {dailyChecks:daily()}; const {ctx} = setup(db);
  ctx.syncArchiveForDate('2026-11-08');
  const a = db.historicalArchive[0];
  assert.deepEqual(JSON.parse(JSON.stringify(a.trackWalk)), db.dailyChecks.trackWalk);
  assert.deepEqual(JSON.parse(JSON.stringify(a.testRun)), db.dailyChecks.testRun);
  assert.deepEqual(Array.from(a.runningTrains), ['Edward']);
  db.dailyChecks.trackWalk.result = 'Fail';
  assert.equal(a.trackWalk.result, 'Pass');
});
test('attendance archive receives check updates and unrelated dates retain checks', () => {
  const db = {dailyChecks:daily(),clockLogs:[{date:'2026-11-08',name:'Alex',clockIn:'09:00',clockOut:'12:00'}],historicalArchive:[{date:'2026-11-08',trackWalk:{result:'Not Completed'}}]};
  const {ctx} = setup(db); ctx.syncArchiveForDate('2026-11-08');
  assert.equal(db.historicalArchive[0].trackWalk.result,'Pass');
  db.dailyChecks = {lastCheckDate:'2026-11-09'};
  ctx.syncArchiveForDate('2026-11-08');
  assert.equal(db.historicalArchive[0].testRun.result,'Fail');
  assert.equal(db.historicalArchive[0].attendance[0].clockOut,'12:00');
});
test('rollover saves checks and trains atomically with daily reset', () => {
  const db = {dailyChecks:daily()}; const {ctx,writes} = setup(db);
  ctx.archiveAndResetIfNewDay();
  assert.equal(writes.length,1);
  assert.equal(writes[0].historicalArchive[0].trackWalk.result,'Pass');
  assert.deepEqual(writes[0].historicalArchive[0].runningTrains,['Edward']);
  assert.equal(writes[0].dailyChecks.lastCheckDate,'2026-11-09');
  assert.deepEqual(writes[0].dailyChecks.runningTrains,[]);
});
