import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import assignments from '../functions/assignment-model.js';
import {planOperation,operationalLookups} from '../functions/operations.js';
import {resolveNotificationBanner,bannerEligible} from '../functions/banner-notifications.js';
const roster=[{Name:'Alice',Roles:'Standard, Maintenance'},{Name:'Bob',Roles:'Driver'},{Name:'Carol',Roles:'Maintenance supervisor'}];
test('multiple assignees and role-based groups reach exactly the intended people',()=>{
 assert.equal(assignments.includes(['Alice','Bob'],'Bob',roster),true);assert.equal(assignments.includes(['Alice','Bob'],'Al',roster),false);
 assert.equal(assignments.includes([assignments.MAINTENANCE,'Bob'],'Alice',roster),true);assert.equal(assignments.includes(assignments.MAINTENANCE,'Carol',roster),false);
 assert.deepEqual(assignments.expand([assignments.MAINTENANCE,'Bob'],roster),['Bob','Alice']);assert.equal(assignments.includes(assignments.ALL,'Bob',roster),true);
 assert.equal(assignments.includes(assignments.MAINTENANCE,'Bob',[{Name:'Bob',Roles:'Maintenance'}]),true);
 assert.equal(assignments.includes(assignments.MAINTENANCE,'Alice',[{Name:'Alice',Roles:'Standard'}]),false);
});
test('June and Daphne appear once and expand to both physical assets',()=>{const fleet=[{name:'George'},{name:'June'},{name:'Daphne'}],options=assignments.assetChoices(fleet);assert.deepEqual(options.map(o=>o.label),['George','June and Daphne']);assert.deepEqual(assignments.expandAssets(['George','June and Daphne'],fleet),['George','June','Daphne']);assert.equal(assignments.assetLabel(['June','Daphne','George']),'George, June and Daphne');});
test('personal summaries and scheduled banners include team and multiple-person assignments',()=>{
 const data={volunteers:roster,actions:[{Title:'Shared repair',AssignedTo:['Bob',assignments.MAINTENANCE],Status:'Pending',DueDate:'2026-11-01'}]},context=vm.createContext({EVLTAssignments:assignments,document:{addEventListener(){}},toISODate:s=>s});vm.runInContext(fs.readFileSync(new URL('../daily-tools.js',import.meta.url),'utf8'),context);
 assert.equal(context.evltDaySummary(data,{name:'Alice'},()=>true,'2026-11-03').actions.length,1);assert.equal(context.evltDaySummary(data,{name:'Carol'},()=>true,'2026-11-03').actions.length,0);
 const now=new Date('2026-11-03T12:00:00Z'),account={volunteerName:'Alice',grantedPages:{dashboard:true,actions:true}},banner={text:'{count} action{s}: {list}',id:'builtin-my-overdue-actions',builtinKey:'my-overdue-actions',linkPage:'actions'};
 assert.ok(resolveNotificationBanner(banner,account,data,now));assert.equal(resolveNotificationBanner(banner,{...account,volunteerName:'Carol'},data,now),null);
 assert.equal(bannerEligible({active:true,text:'Shared repair',notification:{mode:'daily'},when:{conditions:['myOverdueActions']}},account,data,now),true);
});
test('maintenance jobs save multiple named people and groups and reject unknown assignees',()=>{const root={EVLT_SYSTEM_ADMIN_UIDS:{admin:true},EVLT_ADMIN_DB:{volunteers:roster,fleetItems:[{name:'George',state:'Out of Service'}]}},actor={uid:'admin'},meta={now:Date.parse('2026-11-03T12:00:00Z'),recordId:'job',secondaryId:'log'};
 const save={action:'saveJob',kind:'fleet',entityId:'George',record:{title:'Repair',status:'Reported',assignedTo:['Alice','Bob',assignments.MAINTENANCE]}};
 assert.deepEqual(planOperation(root,actor,save,meta).result.record.assignedTo,['Alice','Bob',assignments.MAINTENANCE]);assert.throws(()=>planOperation(root,actor,{...save,record:{...save.record,assignedTo:['Unknown']}},meta),/EVLT volunteers/);
 const completed=planOperation(root,actor,{action:'logWork',kind:'fleet',entityId:'George',title:'Shared repair',notes:'Recorded work',completedDate:'2026-11-02',performedBy:['Alice','Bob']},meta);
 assert.deepEqual(completed.root.EVLT_ADMIN_DB.maintenanceLogs[0].performedBy,['Alice','Bob']);assert.equal(completed.root.EVLT_ADMIN_DB.fleetItems[0].state,'Out of Service');
});
test('operational names expose only a maintenance membership flag',()=>{const rows=operationalLookups({volunteers:roster.map(v=>({...v,DBS:'Private'}))}).operationalVolunteerNames;assert.deepEqual(rows,[{Name:'Alice',maintenance:true},{Name:'Bob',maintenance:false},{Name:'Carol',maintenance:false}]);});
