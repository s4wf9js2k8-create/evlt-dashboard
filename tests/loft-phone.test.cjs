const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context=vm.createContext({console});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../loft-geometry.js'),'utf8'),context);
vm.runInContext(`let loftDraft=null,loftSaving=false,loftDrawing=false,loftStatus='',loftSelectedSectionId='a'; const currentUser={isSystemAdmin:true}; const loftCopy=v=>JSON.parse(JSON.stringify(v)); const loftSections=m=>m.sections||[]; function renderLoftMap(){} function loftSetStatus(v){loftStatus=v;}`,context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../loft-phone-controls.js'),'utf8'),context);
const run=s=>vm.runInContext(s,context);
for(const id of ['rectangle','square','l','u','t','narrow']){
  run(`loftDraft={outline:LoftGeometry.rectangle(),sections:[{id:'a',name:'Linked section',x:75,y:7,w:15,h:22}]};loftApplyRoomPreset('${id}');`);
  assert.equal(run('LoftGeometry.validOutline(loftDraft.outline)'),true,id);
  assert.equal(run('loftDraft.sections[0].id'),'a');
  assert.equal(run('loftDraft.sections[0].name'),'Linked section');
  assert.equal(run('LoftGeometry.rectFits(loftDraft.sections[0],loftDraft.outline)'),true,id);
}
run(`loftDraft={outline:LoftGeometry.rectangle(),sections:[{id:'a',name:'A',x:10,y:10,w:20,h:20}]};for(let i=0;i<4;i++)loftTransformRoom('rotate');`);
assert.equal(run('loftDraft.sections[0].x'),10);assert.equal(run('loftDraft.sections[0].y'),10);
run(`loftTransformRoom('flip');loftTransformRoom('flip')`);assert.equal(run('loftDraft.sections[0].x'),10);
run(`loftNudgeSection('right')`);assert.equal(run('loftDraft.sections[0].x'),12);
run(`loftNudgeSection('grow')`);assert.ok(run('loftDraft.sections[0].w')>20);
run(`loftDraft.sections[0]={id:'a',x:5,y:5,w:20,h:20};loftNudgeSection('left')`);assert.equal(run('loftDraft.sections[0].x'),5);
console.log('Room presets, linked-section preservation, rotate/flip and tap-control checks passed.');

