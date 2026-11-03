// Run only through the local demo project's database emulator. Never targets production.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST,'127.0.0.1:19000','Use the isolated database emulator');
const browser=vm.createContext({console});vm.runInContext(fs.readFileSync(new URL('../record-store.js',import.meta.url),'utf8'),browser);
const require=createRequire(new URL('../functions/package.json',import.meta.url));const {initializeApp,deleteApp}=require('firebase-admin/app');const {getDatabase}=require('firebase-admin/database');
const config={projectId:'demo-evlt-save',databaseURL:'https://demo-evlt-save-default-rtdb.firebaseio.com'};
const seed=initializeApp(config,'seed');const app=initializeApp(config);
const original={EVLT_SYSTEM_ADMIN_UIDS:{admin:true},EVLT_ADMIN_DB:{rolePageAccess:{Standard:{documents:{view:true,edit:false}},Driver:{events:true}},volunteers:[{Name:'Example',Roles:'Standard',photo:'keep'}],loftMaps:{existing:{id:'existing',name:'Existing',updatedAt:1,sections:[{id:'s'}]}}},EVLT_ACCOUNT_BINDINGS:{person:{approved:true,volunteerName:'Example',email:'sample@example.invalid'}},historical:{keep:'untouched'}};
await getDatabase(seed).ref().set(original);
const {saveAccessSettings,setMyAvailability}=await import('../functions/index.js');
const auth={uid:'admin',token:{email_verified:true}};
try{
 const saved=await saveAccessSettings.run({auth,data:{kind:'role',role:'Standard',expected:original.EVLT_ADMIN_DB.rolePageAccess.Standard,permissions:{documents:{view:true,edit:true}}}});
 const concurrent=await Promise.all([
 saveAccessSettings.run({auth,data:{kind:'role',role:'Standard',expected:saved.rolePageAccess.Standard,permissions:{documents:{view:true,edit:true},actions:{view:true}}}}),
 saveAccessSettings.run({auth,data:{kind:'role',role:'Driver',expected:original.EVLT_ADMIN_DB.rolePageAccess.Driver,permissions:{events:{view:true,edit:false},calendar:{view:true}}}})
 ]);assert.ok(concurrent.every(r=>r.saved));
 assert.equal(saved.saved,true);assert.equal((await getDatabase(seed).ref('EVLT_ACCOUNT_BINDINGS/person/editablePages/documents').get()).val(),true);
 await assert.rejects(()=>saveAccessSettings.run({auth,data:{kind:'role',role:'Standard',expected:original.EVLT_ADMIN_DB.rolePageAccess.Standard,permissions:{}}}),/record changed/);
 await assert.rejects(()=>saveAccessSettings.run({auth:{uid:'stranger',token:{email_verified:true}},data:{kind:'role'}}),/System Admin/);
 await assert.rejects(()=>saveAccessSettings.run({auth:{uid:'admin',token:{email_verified:false}},data:{kind:'role'}}),/verified/);
 const fresh=initializeApp(config,'refresh');const root=(await getDatabase(fresh).ref().get()).val();assert.equal(root.EVLT_ADMIN_DB.rolePageAccess.Standard.documents.edit,true);assert.equal(root.EVLT_ADMIN_DB.rolePageAccess.Standard.actions.view,true);assert.equal(root.EVLT_ADMIN_DB.rolePageAccess.Driver.calendar.view,true);assert.deepEqual(root.historical,original.historical);assert.deepEqual(root.EVLT_ADMIN_DB.loftMaps,original.EVLT_ADMIN_DB.loftMaps);await deleteApp(fresh);
 const volunteer=root.EVLT_ADMIN_DB.volunteers[0];await saveAccessSettings.run({auth,data:{kind:'volunteer',expected:volunteer,name:'Renamed',roles:['Driver'],dbs:'Cleared'}});const after=(await getDatabase(seed).ref().get()).val();assert.equal(after.EVLT_ACCOUNT_BINDINGS.person.volunteerName,'Renamed');assert.equal(after.EVLT_ACCOUNT_BINDINGS.person.grantedPages.events,true);assert.equal(after.EVLT_ADMIN_DB.volunteers[0].photo,'keep');
 const ownAuth={uid:'person',token:{email:'sample@example.invalid',email_verified:true}};
 const availability=await setMyAvailability.run({auth:ownAuth,data:{date:'2026-11-03',attending:true,name:'Unauthorised target'}});assert.equal(availability.saved,true);assert.equal(availability.rotaSignups[0].name,'Renamed');
 const again=await setMyAvailability.run({auth:ownAuth,data:{date:'2026-11-03',attending:true}});assert.equal(again.rotaSignups.length,1);
 await getDatabase(seed).ref('EVLT_ADMIN_DB/rotaSignups').transaction(value=>[...Object.values(value||{}),{id:'other',date:'2026-11-03',name:'Other Volunteer'}]);
 const cancelled=await setMyAvailability.run({auth:ownAuth,data:{date:'2026-11-03',attending:false}});assert.equal(cancelled.rotaSignups.length,1);assert.equal(cancelled.rotaSignups[0].name,'Other Volunteer');
 await assert.rejects(()=>setMyAvailability.run({auth:{uid:'stranger',token:{email:'stranger@example.invalid',email_verified:true}},data:{date:'2026-11-03',attending:true}}),/Availability could not/);
 const mapRef=getDatabase(seed).ref('EVLT_ADMIN_DB/loftMaps/existing');const map={...original.EVLT_ADMIN_DB.loftMaps.existing,updatedAt:2,name:'Updated map'};
 const written=await browser.evltCheckedTransaction(mapRef,previous=>previous?.updatedAt===1?map:undefined);assert.equal(written.committed,true);
 const stale=await mapRef.transaction(previous=>previous?.updatedAt===1?{...map,name:'Stale overwrite'}:undefined);assert.equal(stale.committed,false);
 const cold=initializeApp(config,'cold');assert.equal((await getDatabase(cold).ref('EVLT_ADMIN_DB/loftMaps/existing/name').get()).val(),'Updated map');await deleteApp(cold);
 console.log('Own-availability scoping/idempotence, actual callable handler, concurrent role saves, atomic database writes, loft transaction persistence, independent refresh reads, stale-save rejection and admin checks passed in the local demo emulator.');
}finally{await deleteApp(seed);await deleteApp(app);}
