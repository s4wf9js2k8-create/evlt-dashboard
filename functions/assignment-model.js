export const ALL='__ALL_VOLUNTEERS__',MAINTENANCE='__MAINTENANCE_TEAM__',CARRIAGES='June and Daphne';
const norm=value=>String(value||'').trim().toLowerCase();
export const values=value=>[...new Set((Array.isArray(value)?value:value?[value]:[]).map(v=>String(v).trim()).filter(Boolean))];
export const nameOf=v=>String(v?.Name||v?.name||v?.['Volunteer Name']||'').trim();
export function isMaintenance(v){return v?.maintenance===true||String(v?.Roles||v?.roles||'').split(',').some(r=>norm(r)==='maintenance');}
export function canonical(value){return values(value).map(v=>/^(all|all volunteers)$/i.test(v)?ALL:/^maintenance team$/i.test(v)?MAINTENANCE:v);}
export function includes(value,name,volunteers=[],roles=''){const chosen=canonical(value);return !!norm(name)&&(chosen.some(v=>norm(v)===norm(name))||chosen.includes(ALL)||chosen.includes(MAINTENANCE)&&(String(roles||'').split(',').some(r=>norm(r)==='maintenance')||Object.values(volunteers||{}).some(v=>norm(nameOf(v))===norm(name)&&isMaintenance(v))));}
export const label=value=>canonical(value).map(v=>v===ALL?'All volunteers':v===MAINTENANCE?'Maintenance team':v).join(', ');
export function expand(value,volunteers){const roster=Object.values(volunteers||{}).filter(Boolean),chosen=canonical(value);return [...new Set([...chosen.filter(v=>![ALL,MAINTENANCE].includes(v)),...roster.filter(v=>chosen.includes(ALL)||chosen.includes(MAINTENANCE)&&isMaintenance(v)).map(nameOf)])];}
export function assetChoices(fleet){const names=[...new Set(Object.values(fleet||{}).filter(Boolean).map(a=>a.name||a.Name||a.assetName).filter(Boolean))],pair=['June','Daphne'].filter(n=>names.some(v=>norm(v)===norm(n)));return [...names.filter(n=>!pair.some(p=>norm(p)===norm(n))).map(name=>({value:name,label:name,members:[name]})),...(pair.length?[{value:CARRIAGES,label:CARRIAGES,members:pair.map(p=>names.find(n=>norm(n)===norm(p)))}]:[])];}
export function expandAssets(value,fleet){const choices=assetChoices(fleet);return [...new Set(values(value).flatMap(v=>choices.find(c=>c.value===v)?.members||[v]))];}
export function assetLabel(value){const names=values(value),pair=names.filter(v=>['june','daphne','june and daphne'].includes(norm(v)));return [...names.filter(v=>!pair.includes(v)),...(pair.length?[CARRIAGES]:[])].join(', ');}
const api={ALL,MAINTENANCE,CARRIAGES,values,nameOf,isMaintenance,canonical,includes,label,expand,assetChoices,expandAssets,assetLabel};
if(typeof window!=='undefined')window.EVLTAssignments=api;
export default api;
