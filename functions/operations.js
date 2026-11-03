import {canonical} from './access-persistence.js';

export class OperationsError extends Error {constructor(code,message){super(message);this.code=code;}}
const fail=(code,message)=>{throw new OperationsError(code,message);};
const list=value=>Object.values(value||{}).filter(Boolean);
const text=(value,max=200)=>String(value??'').trim().slice(0,max);
const integer=(value,min,max,label)=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)fail('invalid-argument','Check '+label+'.');return n;};
const day=value=>{const s=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail('invalid-argument','Choose a valid date.');return s;};
const time=value=>{const s=text(value,5);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))fail('invalid-argument','Choose a valid time.');return s;};
const id=value=>{const s=text(value,100);if(!/^[a-zA-Z0-9_-]+$/.test(s))fail('invalid-argument','Invalid record reference.');return s;};
const url=value=>{const s=text(value,2000);if(!s)return '';try{if(new URL(s).protocol==='https:')return s;}catch{}fail('invalid-argument','Document links must use HTTPS.');};
const required=(value,label,max=200)=>{const s=text(value,max);if(!s)fail('invalid-argument','Enter '+label+'.');return s;};
const today=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
const nameOf=v=>text(v?.Name||v?.name||v?.['Volunteer Name']||v?.['Volunteer ID']);
const same=(a,b)=>text(a).toLowerCase()===text(b).toLowerCase();
export function canOperate(root,actor,page){if(page==='bookings')page='events';const b=root?.EVLT_ACCOUNT_BINDINGS?.[actor.uid];return root?.EVLT_SYSTEM_ADMIN_UIDS?.[actor.uid]===true||!!(b?.approved===true&&b.email===actor.email&&b.editablePages?.[page]===true);}
export function operationalLookups(db){return {operationalVolunteerNames:[...new Set(list(db.volunteers).map(nameOf).filter(Boolean))].sort().map(Name=>({Name})),fleetDefectSummary:list(db.incidents).filter(i=>!/^(resolved|closed|cancelled)$/i.test(text(i.Status))&&/out of service|red/i.test(text(i['Red Tag Status']))).map((i,index)=>({id:String(i.id||index),asset:text(i.asset||i.assetName||i['Asset / Location'],200),Status:text(i.Status,60),'Red Tag Status':text(i['Red Tag Status'],60)}))};}
function checkAccess(root,actor,page){if(!actor.uid||!canOperate(root,actor,page))fail('permission-denied','You need editing access to '+page+' for this action.');}
function currentRecord(collection,key,expected){const current=collection?.[key];if(current){if(Number(expected)!==Number(current.revision||0))fail('aborted','This record has changed. Reopen it before saving.');}else if(Number(expected||0)!==0)fail('not-found','This record is no longer available.');return current||null;}
function changed(current,record,actor,now,action,note=''){return {...current,...record,revision:Number(current?.revision||0)+1,createdAt:current?.createdAt||now,updatedAt:now,updatedBy:actor.name,history:[...(current?.history||[]).slice(-199),{at:now,uid:actor.uid,by:actor.name,action,note:text(note,2000)}]};}
const optionalDay=value=>value?day(value):'';
function attachment(value){if(!value)return null;return {name:required(value.name,'document name'),url:url(value.url||value.webUrl),provider:text(value.provider,30)||'link',itemId:text(value.itemId,150),driveId:text(value.driveId,150)};}
function entityCollection(kind){if(!['fleet','equipment'].includes(kind))fail('invalid-argument','Choose fleet or equipment.');return kind;}
function findEntity(db,kind,key){const entities=kind==='fleet'?list(db.fleetItems):list(db.equipmentAssets);const found=entities.find(e=>String(e.id||e.name)===String(key)||kind==='fleet'&&(e.name===key||(e.previousNames||[]).includes(key)));if(!found)fail('not-found','The selected asset no longer exists.');return found;}
function putFleet(db,entity,oldKey){const fleet=list(db.fleetItems),i=fleet.findIndex(f=>String(f.id||f.name)===String(oldKey||entity.id||entity.name));if(i<0)fleet.push(entity);else fleet[i]=entity;db.fleetItems=fleet;}
function entityMatches(record,entity){return [entity.id,entity.name,...(entity.previousNames||[])].filter(Boolean).includes(record.entityId);}
function blockingJobs(db,kind,entity){return list(db[kind+'Jobs']).filter(job=>entityMatches(job,entity)&&job.blocking===true&&!['Complete','Cancelled'].includes(job.status));}
function putEntityState(db,kind,entity,state){if(kind==='fleet')putFleet(db,{...entity,state,revision:Number(entity.revision||0)+1},entity.id||entity.name);else db.equipmentAssets[entity.id]={...entity,state,revision:Number(entity.revision||0)+1};}
function redDefects(db,entity){return list(db.incidents).filter(i=>[entity.name,...(entity.previousNames||[])].some(n=>same(i.asset||i.assetName,n))&&!/^(resolved|closed|cancelled)$/i.test(text(i.Status))&&/out of service|red/i.test(text(i['Red Tag Status'])));}
function appendMaintenance(db,entity,actor,now,recordId,workDone,updateState='',recordDate=today(now)){db.maintenanceLogs=[...list(db.maintenanceLogs),{id:recordId,assetName:entity.name,workDone,startDate:recordDate,endDate:recordDate,performedBy:[actor.name],recordedBy:actor.name,updateState,createdAt:now,source:'operations'}];}

export function validateBooking(input){
  const record={groupName:required(input.groupName,'group or school name',160),contactName:required(input.contactName,'contact name',120),email:required(input.email,'contact email',254),phone:text(input.phone,50),type:required(input.type,'visit type',80),date:day(input.date),startTime:time(input.startTime),endTime:time(input.endTime),adults:integer(input.adults,0,500,'adult numbers'),children:integer(input.children,0,500,'child numbers'),location:text(input.location,160)||'EVLT site',notes:text(input.notes,5000),accessNotes:text(input.accessNotes,1500),pricePence:input.pricePence===''||input.pricePence==null?null:integer(input.pricePence,0,10000000,'quoted price'),overrideReason:text(input.overrideReason,1500)};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email))fail('invalid-argument','Enter a valid contact email.');
  if(record.endTime<=record.startTime)fail('invalid-argument','The visit must end after it starts.');if(record.adults+record.children<1)fail('invalid-argument','Add at least one visitor.');return record;
}
function bookingRuleWarnings(db,booking,key,now){const settings=db.operationsSettings?.visits||{},warnings=[];const capacity=Number(settings.capacity||0),total=booking.adults+booking.children;const overlapping=list(db.visitBookings).filter(b=>b.id!==key&&b.status==='Confirmed'&&b.date===booking.date&&b.startTime<booking.endTime&&b.endTime>booking.startTime);if(!capacity)warnings.push('Visitor capacity is not configured');else if(total+overlapping.reduce((n,b)=>n+Number(b.adults||0)+Number(b.children||0),0)>capacity)warnings.push('Overlapping confirmed visits exceed visitor capacity');if(settings.openTime&&booking.startTime<settings.openTime)warnings.push('Visit starts before the configured opening time');if(settings.closeTime&&booking.endTime>settings.closeTime)warnings.push('Visit ends after the configured closing time');const weekday=new Date(booking.date+'T12:00:00Z').getUTCDay();if(settings.allowedDays?.length&&!settings.allowedDays.includes(weekday))warnings.push('This is outside configured visit days');if(Number(settings.minimumNoticeDays||0)>0&&(Date.parse(booking.date)-Date.parse(today(now)))/86400000<settings.minimumNoticeDays)warnings.push('Less than the required advance notice');return warnings;}
export function visitPriceEstimate(prices,booking){const rate=prices?.[booking.type];if(!rate||rate.adultPence==null||rate.childPence==null)return null;return Math.max(Number(rate.minimumPence||0),booking.adults*rate.adultPence+booking.children*rate.childPence);}

export function planOperation(source,actor,input,meta){
  const {now,recordId,secondaryId}=meta,action=String(input.action||'');
  const kind=input.kind?entityCollection(input.kind):null;
  const page=action==='saveSettings'||action==='saveMicrosoftConfig'?'settings':action.includes('Booking')?'bookings':action.includes('Equipment')?'equipment':kind==='equipment'?'equipment':'maintenance';
  checkAccess(source,actor,page);const root=JSON.parse(JSON.stringify(source)),db=root.EVLT_ADMIN_DB||(root.EVLT_ADMIN_DB={});
  actor={...actor,name:source.EVLT_ACCOUNT_BINDINGS?.[actor.uid]?.volunteerName||'System Admin'};
  for(const key of ['visitBookings','equipmentAssets','equipmentLoans','equipmentJobs','equipmentPlans','fleetJobs','fleetPlans'])db[key]||={};
  let result;
  if(action==='saveSettings'){
    if(root.EVLT_SYSTEM_ADMIN_UIDS?.[actor.uid]!==true)fail('permission-denied','Only a System Admin can change operating rules.');
    const visits=input.visits||{},settings={visits:{capacity:visits.capacity===''||visits.capacity==null?null:integer(visits.capacity,1,1000,'visitor capacity'),openTime:visits.openTime?time(visits.openTime):'',closeTime:visits.closeTime?time(visits.closeTime):'',minimumNoticeDays:integer(visits.minimumNoticeDays||0,0,365,'advance notice'),allowedDays:(visits.allowedDays||[]).map(d=>integer(d,0,6,'visit days')),rules:text(visits.rules,4000),publicRequestsEnabled:visits.publicRequestsEnabled===true,requireAdminApproval:visits.requireAdminApproval!==false},updatedAt:now,updatedBy:actor.name};
    if(settings.visits.openTime&&settings.visits.closeTime&&settings.visits.closeTime<=settings.visits.openTime)fail('invalid-argument','Closing time must be after opening time.');
    settings.visits.prices={};for(const type of ['School','Private group','Birthday','Other']){const rate=visits.prices?.[type];if(!rate)continue;settings.visits.prices[type]={adultPence:integer(rate.adultPence,0,1000000,'adult price'),childPence:integer(rate.childPence,0,1000000,'child price'),minimumPence:integer(rate.minimumPence||0,0,10000000,'minimum group price')};}
    if(input.expectedUpdatedAt!==undefined&&Number(input.expectedUpdatedAt||0)!==Number(db.operationsSettings?.updatedAt||0))fail('aborted','The operating rules changed. Reload before saving.');db.operationsSettings=settings;result={collection:'operationsSettings',record:settings};
  }else if(action==='saveMicrosoftConfig'){
    if(root.EVLT_SYSTEM_ADMIN_UIDS?.[actor.uid]!==true)fail('permission-denied','Only a System Admin can configure Microsoft 365.');
    const clientId=text(input.clientId,80),tenantId=text(input.tenantId,80);if(!/^[a-f\d-]{36}$/i.test(clientId)||!/^[a-f\d-]{36}$/i.test(tenantId))fail('invalid-argument','Enter the application and tenant IDs from Microsoft Entra.');
    const calendarMailbox=text(input.calendarMailbox,254);if(calendarMailbox&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(calendarMailbox))fail('invalid-argument','Enter the shared calendar mailbox email address.');
    db.ms365Config={clientId,tenantId,calendarMailbox,calendarId:text(input.calendarId,300),updatedAt:now};result={collection:'ms365Config',record:db.ms365Config};
  }else if(action==='importMaintenanceScan'){
    const key=id(input.id||recordId),r=input.record||{},date=day(r.date);if(date>today(now))fail('invalid-argument','A historical maintenance log cannot be dated in the future.');
    const known=[...list(db.fleetItems),...list(db.eurotunnelTrains),...list(db.assets)].map(a=>a.name||a.assetName||a.Name).filter(Boolean),assetName=required(r.assetName,'asset name',160);
    if(!known.includes(assetName))fail('invalid-argument','Choose an existing locomotive or asset.');
    const entries=list(db.maintenanceLogs);if(entries.some(e=>String(e.id)===key))fail('already-exists','This scanned record has already been saved. Reopen Maintenance history to view it.');
    const pages=(r.scanPages||[]).slice(0,6);let total=0;for(const page of pages){total+=String(page).length;if(typeof page!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(page)||page.length>1600000||total>7000000)fail('invalid-argument','A scanned page is invalid or too large.');}
    const next={id:key,assetName,workDone:required(r.workDone,'work done / original text',100000),title:text(r.title,200),startDate:date,endDate:date,performedBy:Array.isArray(r.performedBy)?r.performedBy.map(v=>text(v,150)).filter(Boolean).slice(0,30):[],recordedBy:actor.name,createdAt:now,updateState:'',photo:pages[0]||'',scanPages:pages,scanReader:text(r.scanReader,80),source:'scanned-historical-log',notes:'Imported from original paperwork. Transcription reviewed before saving.'};
    db.maintenanceLogs=[...entries,next];result={collection:'maintenanceLogs',record:next};
  }else if(action==='saveBooking'){
    const key=input.id?id(input.id):recordId,current=currentRecord(db.visitBookings,key,input.expectedRevision),booking=validateBooking(input.record||{}),status=input.record.status||'Request';
    if(!['Request','Reviewing','Confirmed','Completed','Cancelled','Declined'].includes(status))fail('invalid-argument','Choose a booking status.');
    const administrator=root.EVLT_SYSTEM_ADMIN_UIDS?.[actor.uid]===true,unchangedVisit=current&&['groupName','type','date','startTime','endTime','adults','children','location','pricePence'].every(field=>canonical(current[field]??null)===canonical(booking[field]??null));let exceptionApprovedBy=current?.exceptionApprovedBy||'',exceptionApprovedAt=current?.exceptionApprovedAt||0;
    if(['Confirmed','Completed'].includes(status)){
      if(db.operationsSettings?.visits?.requireAdminApproval!==false&&!administrator&&(!['Confirmed','Completed'].includes(current?.status)||!unchangedVisit))fail('permission-denied','The visit rules require a System Admin to confirm these arrangements.');
      const warnings=bookingRuleWarnings(db,booking,key,now);if(warnings.length){const retained=current?.exceptionApprovedBy&&unchangedVisit&&current.overrideReason===booking.overrideReason;if(!administrator&&!retained)fail('permission-denied','A System Admin must authorise exceptions to the visit limits.');if(!booking.overrideReason)fail('failed-precondition',warnings.join('. ')+'. Record an authorised exception reason to proceed.');if(administrator){exceptionApprovedBy=actor.uid;exceptionApprovedAt=now;}}else{exceptionApprovedBy='';exceptionApprovedAt=0;}
    }
    const linkedEventId=text(current?.linkedEventId||input.record.linkedEventId,120);
    if(!current&&linkedEventId&&!canOperate(root,actor,'events'))fail('permission-denied','Editing access to Events is required to link an existing event.');
    const next=changed(current,{...booking,exceptionApprovedBy,exceptionApprovedAt,estimatedPricePence:visitPriceEstimate(db.operationsSettings?.visits?.prices,booking),id:key,status,reference:current?.reference||'EVLT-'+key.slice(-8).toUpperCase(),linkedEventId:linkedEventId||'booking-'+key},actor,now,'Booking '+status,input.changeNote);db.visitBookings[key]=next;
    const events=list(db.events),index=events.findIndex(e=>String(e.id)===next.linkedEventId);
    if(['Confirmed','Completed'].includes(status)){
      const existing=index>=0?events[index]:{};if(existing.bookingId&&existing.bookingId!==key)fail('already-exists','That event is linked to another booking.');
      const entry={...existing,id:next.linkedEventId,bookingId:key,Title:booking.type+' · '+booking.groupName,EventType:booking.type,AccessLevel:'Group booking',StartDate:booking.date,EndDate:booking.date,StartTime:booking.startTime,EndTime:booking.endTime,Location:booking.location,Description:next.reference+' · '+(booking.adults+booking.children)+' visitors. Booking contact and arrangements are held in the booking hub.'};
      // Existing private contact/notes are never copied into the shared calendar by this workflow.
      delete entry.Contact;delete entry.contact;delete entry.Requirements;
      if(index>=0)events[index]=entry;else events.push(entry);db.events=events;
    }else if(['Cancelled','Declined'].includes(status)&&index>=0&&events[index].bookingId===key){db.events=events.filter((e,i)=>i!==index);}
    result={collection:'visitBookings',record:next};
  }else if(['linkBookingCalendar','linkJobCalendar','linkPlanCalendar'].includes(action)){
    const collection=action==='linkBookingCalendar'?'visitBookings':kind+(action==='linkJobCalendar'?'Jobs':'Plans'),key=id(input.id),record=currentRecord(db[collection],key,input.expectedRevision);if(!record)fail('not-found','Reopen the record before linking the calendar.');
    const mailbox=text(input.msMailbox,254),calendarId=text(input.msCalendarId,1000),accountId=text(input.msAccountId,300);
    if(mailbox&&(mailbox!==db.ms365Config?.calendarMailbox||calendarId!==(db.ms365Config?.calendarId||'')))fail('failed-precondition','The shared calendar configuration changed. Reopen this record.');
    const link={ownerUid:actor.uid,accountId,mailbox,calendarId,eventId:required(input.msEventId,'Microsoft event reference',1000),webLink:url(input.msEventWebLink),updatedAt:now};
    const links=(record.msCalendarLinks||[]).filter(l=>!(l.mailbox===mailbox&&l.calendarId===calendarId&&(mailbox||l.ownerUid===actor.uid&&l.accountId===accountId)));
    if(links.length>=200)fail('resource-exhausted','This record has too many calendar connections. Contact a System Admin.');
    const next=changed(record,{msCalendarLinks:[...links,link]},actor,now,'Microsoft calendar linked',mailbox?'Shared EVLT calendar':'Personal Outlook calendar');db[collection][key]=next;result={collection,record:next};
  }else if(action==='saveEquipment'){
    const key=input.id?id(input.id):recordId,current=currentRecord(db.equipmentAssets,key,input.expectedRevision),r=input.record||{},state=r.state||'Available';if(!['Available','Under repair','Retired'].includes(state))fail('invalid-argument','Choose an equipment state.');
    if(state==='Available'&&current&&blockingJobs(db,'equipment',current).length)fail('failed-precondition','Finish the blocking repair jobs before making this item available.');
    if(state==='Available'&&current&&current.state!=='Available')fail('failed-precondition','Use the return-to-service review to release a held item.');
    const next=changed(current,{id:key,name:required(r.name,'equipment name',160),category:text(r.category,100),serial:text(r.serial,100),location:text(r.location,200),itemCodeId:text(r.itemCodeId,100),state,loanable:r.loanable!==false,inspectionRequired:r.inspectionRequired===true,nextInspection:optionalDay(r.nextInspection),notes:text(r.notes,3000),documents:(r.documents||[]).slice(0,30).map(attachment).filter(Boolean)},actor,now,'Equipment updated');db.equipmentAssets[key]=next;result={collection:'equipmentAssets',record:next};
  }else if(action==='checkoutEquipment'){
    const asset=findEntity(db,'equipment',input.assetId),borrower=list(db.volunteers).find(v=>same(nameOf(v),input.borrower));if(!borrower)fail('invalid-argument','Choose a current EVLT volunteer.');
    if(asset.state!=='Available'||asset.loanable===false||blockingJobs(db,'equipment',asset).length)fail('failed-precondition','This equipment is not available to borrow.');
    if(asset.inspectionRequired&&(!asset.nextInspection||asset.nextInspection<today(now)))fail('failed-precondition','The required inspection must be recorded before checkout.');
    if(list(db.equipmentPlans).some(p=>p.active!==false&&p.requiredBeforeUse&&entityMatches(p,asset)&&p.nextDue<today(now)))fail('failed-precondition','Complete the overdue required service before checkout.');
    if(list(db.equipmentLoans).some(l=>l.assetId===asset.id&&l.status==='Out'))fail('already-exists','Someone else has already checked out this item.');
    const due=day(input.dueDate);if(due<today(now))fail('invalid-argument','The return date cannot be in the past.');
    const loan=changed(null,{id:recordId,assetId:asset.id,assetName:asset.name,borrower:nameOf(borrower),dueDate:due,status:'Out',checkedOutAt:now,notes:text(input.notes,2000)},actor,now,'Checked out');db.equipmentLoans[recordId]=loan;result={collection:'equipmentLoans',record:loan};
  }else if(action==='returnEquipment'){
    const key=id(input.id),loan=currentRecord(db.equipmentLoans,key,input.expectedRevision);if(!loan||loan.status!=='Out')fail('failed-precondition','This loan is no longer checked out.');const asset=findEntity(db,'equipment',loan.assetId),condition=input.condition;
    if(!['Good','Damaged','Needs inspection'].includes(condition))fail('invalid-argument','Choose a return condition.');const notes=text(input.notes,3000);if(condition!=='Good'&&!notes)fail('invalid-argument','Describe the issue found on return.');
    const next=changed(loan,{status:'Returned',returnedAt:now,returnCondition:condition,returnNotes:notes},actor,now,'Returned',notes);db.equipmentLoans[key]=next;
    if(condition!=='Good'){
      db.equipmentJobs[secondaryId]=changed(null,{id:secondaryId,entityId:asset.id,entityName:asset.name,title:'Inspect returned '+asset.name,description:notes,priority:'High',blocking:true,status:'Reported',assignedTo:'',dueDate:today(now),workDone:'',documents:[]},actor,now,'Reported from return');putEntityState(db,'equipment',asset,'Under repair');
    }result={collection:'equipmentLoans',record:next};
  }else if(action==='saveFleet'){
    const current=input.entityId?findEntity(db,'fleet',input.entityId):null,r=input.record||{};
    if(current&&Number(current.revision||0)!==Number(input.expectedRevision||0))fail('aborted','This fleet record changed. Reopen it before saving.');
    const name=required(r.name,'fleet name',140),state=r.state||current?.state||'Out of Service';if(!['In Service','Overhaul','Out of Service','Retired'].includes(state))fail('invalid-argument','Choose a fleet state.');
    if(list(db.fleetItems).some(e=>e!==current&&same(e.name,name)))fail('already-exists','That fleet name is already in use.');
    if(state==='In Service'&&current?.state!=='In Service')fail('failed-precondition','Use the return-to-service review to release this asset.');
    if(state==='In Service'&&current&&(blockingJobs(db,'fleet',current).length||redDefects(db,current).length))fail('failed-precondition','An open blocking job or red-tagged defect prevents service.');
    const previousNames=[...new Set([...(current?.previousNames||[]),...(current&&current.name!==name?[current.name]:[])])];
    const next=changed(current,{id:current?.id||recordId,name,type:text(r.type,60)||'Other',gauge:text(r.gauge,60),state,photo:r.photo===undefined?(current?.photo||''):r.photo===current?.photo?(r.photo||''):r.photo?url(r.photo):'',notes:text(r.notes,4000),previousNames,documents:(r.documents||current?.documents||[]).slice(0,30).map(attachment).filter(Boolean)},actor,now,'Fleet record updated');putFleet(db,next,current?.id||current?.name);result={collection:'fleetItems',record:next,previousKey:current?.id||current?.name||''};
  }else if(action==='logWork'){
    const entity=findEntity(db,kind,input.entityId),notes=required(input.notes,'work done and findings',6000),completed=day(input.completedDate||today(now));if(completed>today(now))fail('invalid-argument','Completed work cannot be in the future.');
    const record=changed(null,{id:recordId,entityId:entity.id||entity.name,entityName:entity.name,title:required(input.title,'work title',180),status:'Complete',priority:'Normal',blocking:false,workDone:notes,completedDate:completed,documents:[]},actor,now,'Completed work recorded',notes);db[kind+'Jobs'][recordId]=record;
    if(kind==='fleet'){appendMaintenance(db,entity,actor,now,secondaryId,record.title+'\n'+notes);const log=db.maintenanceLogs[db.maintenanceLogs.length-1];log.startDate=completed;log.endDate=completed;}result={collection:kind+'Jobs',record};
  }else if(action==='saveJob'){
    const entity=findEntity(db,kind,input.entityId),collection=kind+'Jobs',key=input.id?id(input.id):recordId,current=currentRecord(db[collection],key,input.expectedRevision),r=input.record||{};
    if(current&&!entityMatches(current,entity))fail('invalid-argument','A job cannot be moved to another asset.');
    if(current&&['Complete','Cancelled'].includes(current.status))fail('failed-precondition','Completed jobs are kept as history. Create a new job for further work.');
    const status=r.status||'Reported';if(!['Reported','In progress','Awaiting inspection'].includes(status))fail('invalid-argument','Use the inspection action to close a job.');
    const assignedTo=text(r.assignedTo,150);if(assignedTo&&!list(db.volunteers).some(v=>same(nameOf(v),assignedTo)))fail('invalid-argument','Choose an EVLT volunteer for the job.');
    const next=changed(current,{id:key,entityId:entity.id||entity.name,entityName:entity.name,title:required(r.title,'job title',180),description:text(r.description,5000),priority:['Low','Normal','High','Urgent'].includes(r.priority)?r.priority:'Normal',blocking:current?.blocking===true||r.blocking===true,status,assignedTo,dueDate:optionalDay(r.dueDate),workDone:text(r.workDone,6000),documents:(r.documents||[]).slice(0,30).map(attachment).filter(Boolean)},actor,now,'Job '+status,r.changeNote);db[collection][key]=next;if(next.blocking)putEntityState(db,kind,entity,kind==='fleet'?'Out of Service':'Under repair');result={collection,record:next};
  }else if(action==='inspectJob'){
    const collection=kind+'Jobs',key=id(input.id),job=currentRecord(db[collection],key,input.expectedRevision);if(!job||job.status!=='Awaiting inspection'||!job.workDone)fail('failed-precondition','Record completed work and move the job to Awaiting inspection first.');
    const entity=findEntity(db,kind,job.entityId),note=required(input.notes,'inspection findings',4000),next=changed(job,{status:'Complete',inspectedAt:now,inspectedBy:actor.name,inspectionNotes:note},actor,now,'Inspection completed',note);db[collection][key]=next;
    if(kind==='fleet')appendMaintenance(db,entity,actor,now,secondaryId,job.title+'\n'+job.workDone+'\nInspection: '+note);result={collection,record:next};
  }else if(action==='savePlan'){
    const entity=findEntity(db,kind,input.entityId),collection=kind+'Plans',key=input.id?id(input.id):recordId,current=currentRecord(db[collection],key,input.expectedRevision),r=input.record||{};
    if(current&&!entityMatches(current,entity))fail('invalid-argument','A service plan cannot be moved to another asset.');
    const next=changed(current,{id:key,entityId:entity.id||entity.name,entityName:entity.name,title:required(r.title,'inspection or service name',180),intervalDays:integer(r.intervalDays,1,3650,'repeat interval'),nextDue:day(r.nextDue),requiredBeforeUse:r.requiredBeforeUse===true,instructions:text(r.instructions,4000),active:r.active!==false},actor,now,'Service plan updated');db[collection][key]=next;if(next.active&&next.requiredBeforeUse&&next.nextDue<today(now))putEntityState(db,kind,entity,kind==='fleet'?'Out of Service':'Under repair');result={collection,record:next};
  }else if(action==='completePlan'){
    const collection=kind+'Plans',key=id(input.id),plan=currentRecord(db[collection],key,input.expectedRevision);if(!plan||plan.active===false)fail('failed-precondition','This service plan is not active.');const entity=findEntity(db,kind,plan.entityId),notes=required(input.notes,'service findings and work done',5000),completed=day(input.completedDate||today(now));if(completed>today(now))fail('invalid-argument','A completed inspection cannot be in the future.');
    const nextDue=new Date(Date.parse(completed+'T00:00:00Z')+plan.intervalDays*86400000).toISOString().slice(0,10),next=changed(plan,{lastCompleted:completed,lastCompletedBy:actor.name,nextDue},actor,now,'Service completed',notes);db[collection][key]=next;
    if(kind==='fleet')appendMaintenance(db,entity,actor,now,secondaryId,plan.title+'\n'+notes,'',completed);else if(entity.inspectionRequired)db.equipmentAssets[entity.id]={...entity,nextInspection:nextDue,revision:Number(entity.revision||0)+1};result={collection,record:next};
  }else if(action==='releaseEntity'){
    const entity=findEntity(db,kind,input.entityId),notes=required(input.notes,'return-to-service review',4000);
    if(blockingJobs(db,kind,entity).length)fail('failed-precondition','There are still open blocking jobs.');
    if(kind==='fleet'&&redDefects(db,entity).length)fail('failed-precondition','Resolve the active red-tagged defects before release.');
    const overdue=list(db[kind+'Plans']).some(p=>p.active!==false&&p.requiredBeforeUse&&entityMatches(p,entity)&&p.nextDue<today(now));if(overdue)fail('failed-precondition','Complete the required overdue inspections first.');
    if(kind==='equipment'&&entity.inspectionRequired&&(!entity.nextInspection||entity.nextInspection<today(now)))fail('failed-precondition','The equipment inspection must be current.');
    const next=changed(entity,{state:kind==='fleet'?'In Service':'Available',releasedAt:now,releasedBy:actor.name,releaseNotes:notes},actor,now,'Return-to-service review',notes);if(kind==='fleet'){putFleet(db,next,entity.id||entity.name);appendMaintenance(db,next,actor,now,secondaryId,'Return-to-service review: '+notes,'In Service');}else db.equipmentAssets[entity.id]=next;result={collection:kind==='fleet'?'fleetItems':'equipmentAssets',record:next};
  }else fail('invalid-argument','Unknown operation.');
  return {root,result};
}

export function planPublicVisitRequest(source,input,meta){
  const db=source?.EVLT_ADMIN_DB;if(db?.operationsSettings?.visits?.publicRequestsEnabled!==true)fail('failed-precondition','Online requests are not currently open. Contact EVLT to arrange your visit.');
  if(input.website)fail('invalid-argument','Request could not be submitted.');const booking=validateBooking(input);if(booking.date<today(meta.now))fail('invalid-argument','Choose today or a future visit date.');
  const root=JSON.parse(JSON.stringify(source)),rates=root.EVLT_VISIT_REQUEST_LIMITS||(root.EVLT_VISIT_REQUEST_LIMITS={}),hour=Math.floor(meta.now/3600000),current=rates[meta.rateKey];if(current?.hour===hour&&current.count>=5)fail('resource-exhausted','Too many requests. Please try later or contact EVLT.');
  rates[meta.rateKey]={hour,count:current?.hour===hour?current.count+1:1};for(const [key,value]of Object.entries(rates))if(value.hour<hour-24)delete rates[key];
  const key=meta.recordId,record={...booking,estimatedPricePence:visitPriceEstimate(db.operationsSettings?.visits?.prices,booking),id:key,status:'Request',reference:'EVLT-'+key.slice(-8).toUpperCase(),revision:1,source:'Public form',createdAt:meta.now,updatedAt:meta.now,history:[{at:meta.now,action:'Visit requested'}]};delete record.pricePence;delete record.overrideReason;
  root.EVLT_ADMIN_DB.visitBookings||={};root.EVLT_ADMIN_DB.visitBookings[key]=record;return {root,result:{reference:record.reference}};
}

export function enforceDueServiceHolds(source,now){const root=JSON.parse(JSON.stringify(source)),db=root.EVLT_ADMIN_DB||{},date=today(now);let changedCount=0;for(const kind of ['fleet','equipment'])for(const plan of list(db[kind+'Plans'])){if(plan.active===false||!plan.requiredBeforeUse||plan.nextDue>=date)continue;let entity;try{entity=findEntity(db,kind,plan.entityId);}catch{continue;}if(kind==='fleet'&&entity.state==='In Service'||kind==='equipment'&&entity.state==='Available'){putEntityState(db,kind,entity,kind==='fleet'?'Out of Service':'Under repair');changedCount++;}}return {root,changedCount};}
