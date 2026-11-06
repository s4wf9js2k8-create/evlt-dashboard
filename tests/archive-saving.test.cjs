const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const store = fs.readFileSync(path.join(__dirname, '../record-store.js'), 'utf8');
function fixture({ fail = false, offline = false } = {}) {
  const original = { date: '2026-11-05', trackWalk: { notes: 'Original' }, attendance: [] };
  let remote = [original];
  let closed = 0, rendered = 0, message = '';
  const form = { dataset: {}, elements: [], setAttribute() {}, removeAttribute() {} };
  const ref = { on(event, cb) { cb(); }, off() {}, async get() {}, async transaction(update) {
    if (fail) throw Error('Permission denied');
    const next = update(remote);
    if (next === undefined) return { committed: false };
    remote = next;
    return { committed: true, snapshot: { val: () => remote } };
  } };
  const ctx = vm.createContext({
    console: { error() {} }, Map, navigator: { onLine: !offline },
    database: { ref: () => ref }, db: { historicalArchive: structuredClone(remote) },
    evltPageKey: () => 'archives', canEditFeature: page => page === 'archives',
    evltToast: text => { message = text; }, evltShowFormMessage: (_, text) => { message = text; },
    alert: text => { message = text; }, confirm: () => true,
    toISODate: date => date, formatDisplayDate: date => date,
    closeModal: () => { closed++; }, renderArchives: () => { rendered++; },
    EVLTAssignments: { expandAssets: () => [] },
    document: { getElementById: () => ({ value: 'Edited' }), querySelectorAll: () => [] }
  });
  vm.runInContext(store, ctx);
  vm.runInContext(source.slice(source.indexOf('      async function saveArchiveEdit('), source.indexOf('      function dataUrlToBlob(')), ctx);
  ctx.evltCaptureEdit('historicalArchive', original);
  return { ctx, form, original, get remote() { return remote; }, set remote(v) { remote = v; },
    get closed() { return closed; }, get rendered() { return rendered; }, get message() { return message; } };
}
test('archive save follows the captured day after list reordering and keeps concurrent additions', async () => {
  const f = fixture();
  const other = { date: '2026-11-06', attendance: [] };
  f.remote = [other, f.original];
  f.ctx.db.historicalArchive = structuredClone(f.remote);
  await f.ctx.saveArchiveEdit({ preventDefault() {}, target: f.form });
  assert.equal(f.remote[0].date, other.date);
  assert.equal(f.remote[1].trackWalk.notes, 'Edited');
  assert.equal(f.original.trackWalk.notes, 'Original');
  assert.equal(f.closed, 1);
  assert.equal(f.rendered, 1);
});
test('conflicting archive edit preserves remote data and leaves the editor open', async () => {
  const f = fixture();
  f.remote = [{ ...f.original, trackWalk: { notes: 'Changed elsewhere' } }];
  await f.ctx.saveArchiveEdit({ preventDefault() {}, target: f.form });
  assert.equal(f.remote[0].trackWalk.notes, 'Changed elsewhere');
  assert.equal(f.closed, 0);
  assert.match(f.message, /changed while/);
});
for (const options of [{ fail: true }, { offline: true }]) test('failed or offline archive save keeps the entry and local data', async () => {
  const f = fixture(options);
  await f.ctx.saveArchiveEdit({ preventDefault() {}, target: f.form });
  assert.equal(f.ctx.db.historicalArchive[0].trackWalk.notes, 'Original');
  assert.equal(f.closed, 0);
  assert.equal(f.form.dataset.evltSaving, undefined);
  assert.ok(f.message);
});
test('archive deletion preserves days added by another user', async () => {
  const f = fixture();
  f.remote = [f.original, { date: '2026-11-06' }];
  await f.ctx.deleteArchiveDay('2026-11-05');
  assert.equal(f.remote.length, 1);
  assert.equal(f.remote[0].date, '2026-11-06');
  assert.equal(f.rendered, 1);
});
test('failed archive deletion keeps local and remote records', async () => {
  const f = fixture({ fail: true });
  await f.ctx.deleteArchiveDay('2026-11-05');
  assert.equal(f.remote.length, 1);
  assert.equal(f.ctx.db.historicalArchive.length, 1);
  assert.equal(f.rendered, 0);
});
