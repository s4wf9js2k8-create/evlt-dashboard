import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({console,URL,location:{href:'https://example.invalid/evlt/'}});
vm.runInContext(fs.readFileSync(new URL('../operations-model.js',import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('../ms365-integration.js',import.meta.url),'utf8'),context);
const model=context.EVLTOperationsModel;
test('equipment and fleet views retain holds and match renamed legacy assets',()=>{
 const asset={id:'a',name:'New name',previousNames:['Old name'],state:'Available'};
 assert.equal(model.equipmentStatus(asset,{}, {j:{entityId:'Old name',blocking:true,status:'Awaiting inspection'}},'2026-11-03'),'On hold');
 assert.equal(model.equipmentStatus(asset,{l:{assetId:'a',status:'Out',dueDate:'2026-11-02'}},{},'2026-11-03'),'Overdue loan');
 assert.equal(model.fleetSummary(asset,{}, {p:{entityId:'Old name',active:true,nextDue:'2026-11-02',requiredBeforeUse:true}},[],'2026-11-03').held,true);
});
test('shared Outlook targets use delegated shared scope and existing links keep original mailbox',()=>{
 const config={calendarMailbox:'visits@example.invalid',calendarId:'shared/id'};
 const target=context.evltMicrosoftCalendarTarget({},config);
 assert.equal(target.base,'/users/visits%40example.invalid/calendars/shared%2Fid/events');
 assert.equal(target.scopes[0],'Calendars.ReadWrite.Shared');
 const existing=context.evltMicrosoftCalendarTarget({msEventId:'event',msCalendarId:''},config);
 assert.equal(existing.base,'/me/calendar/events');
 assert.equal(existing.scopes[0],'Calendars.ReadWrite');
});
test('Outlook event payload uses UK timezone and never adds attendee invitations',()=>{
 const payload=context.evltMicrosoftCalendarPayload({title:'Sample visit',start:'2026-11-10T10:00:00',end:'2026-11-10T12:00:00',description:'Booking reference'},'stable-id');
 assert.equal(payload.start.timeZone,'GMT Standard Time');
 assert.equal(payload.transactionId,'stable-id');
 assert.equal(payload.attendees,undefined);
});
test('Microsoft file pagination cannot send a token to another origin',async()=>{
 context.evltMicrosoftToken=async()=> 'fake-token';let called=false;context.fetch=async()=>{called=true;};
 await assert.rejects(()=>context.evltMicrosoftGraph('https://untrusted.invalid/collect',['Files.Read']),/Invalid Microsoft/);
 assert.equal(called,false);
});
