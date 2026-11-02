const LOFT_ROOM_PRESETS = [
  { id: 'rectangle', name: 'Rectangle', points: [{x:5,y:5},{x:95,y:5},{x:95,y:95},{x:5,y:95}] },
  { id: 'square', name: 'Square', points: [{x:23,y:5},{x:77,y:5},{x:77,y:95},{x:23,y:95}] },
  { id: 'l', name: 'L-shaped', points: [{x:5,y:5},{x:55,y:5},{x:55,y:45},{x:95,y:45},{x:95,y:95},{x:5,y:95}] },
  { id: 'u', name: 'U-shaped', points: [{x:5,y:5},{x:35,y:5},{x:35,y:60},{x:65,y:60},{x:65,y:5},{x:95,y:5},{x:95,y:95},{x:5,y:95}] },
  { id: 't', name: 'T-shaped', points: [{x:5,y:5},{x:95,y:5},{x:95,y:40},{x:67,y:40},{x:67,y:95},{x:33,y:95},{x:33,y:40},{x:5,y:40}] },
  { id: 'narrow', name: 'Long & narrow', points: [{x:5,y:28},{x:95,y:28},{x:95,y:72},{x:5,y:72}] }
];
const LOFT_SECTION_PRESETS = [
  {id:'box',name:'Storage box',w:14,h:23,color:'#c7e2d5'},
  {id:'shelf',name:'Shelving',w:28,h:10,color:'#c8dff0'},
  {id:'cupboard',name:'Cupboard',w:12,h:30,color:'#e0d3ed'},
  {id:'area',name:'Storage area',w:26,h:30,color:'#f8deb5'}
];
function loftPresetButtons() {
  return `<div class="loft-preset-heading">1. Choose the room shape</div><div class="loft-room-presets">${LOFT_ROOM_PRESETS.map(p=>`<button type="button" class="loft-shape-card" onclick="loftApplyRoomPreset('${p.id}')"><svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="${p.points.map(v=>v.x+','+v.y).join(' ')}"/></svg><span>${p.name}</span></button>`).join('')}</div><div class="loft-outline-tools"><button type="button" class="btn btn-secondary btn-sm" onclick="loftTransformRoom('rotate')">↻ Rotate room</button><button type="button" class="btn btn-secondary btn-sm" onclick="loftTransformRoom('flip')">↔ Flip room</button><button type="button" class="btn btn-subtle btn-sm" onclick="loftStartOutline()">Custom outline</button></div><div class="loft-preset-heading">2. Add storage sections</div><div class="loft-storage-presets">${LOFT_SECTION_PRESETS.map(p=>`<button type="button" class="btn btn-secondary" onclick="loftAddSection('${p.id}')">＋ ${p.name}</button>`).join('')}</div>`;
}
function loftApplyRoomPreset(id) {
  if (!loftDraft || !currentUser?.isSystemAdmin || loftSaving) return;
  const preset=LOFT_ROOM_PRESETS.find(p=>p.id===id); if(!preset)return;
  const outline=loftCopy(preset.points), sections=loftCopy(loftSections(loftDraft));
  const placed=[]; let moved=false;
  for(const section of sections){
    if(LoftGeometry.rectFits(section,outline) && !placed.some(s=>section.x<s.x+s.w&&section.x+section.w>s.x&&section.y<s.y+s.h&&section.y+section.h>s.y)){placed.push(section);continue;}
    let fitted=null;
    for(const scale of [1,.75,.5,.3]){
      const w=Math.max(3,section.w*scale),h=Math.max(3,section.h*scale);
      for(let y=5;y<=95-h&&!fitted;y+=2)for(let x=5;x<=95-w&&!fitted;x+=2){
        const candidate={...section,x,y,w,h};
        if(LoftGeometry.rectFits(candidate,outline)&&!placed.some(s=>x<s.x+s.w&&x+w>s.x&&y<s.y+s.h&&y+h>s.y))fitted=candidate;
      }
      if(fitted)break;
    }
    if(!fitted)return loftSetStatus('This shape cannot fit all your storage sections. Choose a larger shape or make some sections smaller first.');
    placed.push(fitted);moved=true;
  }
  loftDraft.outline=outline;loftDraft.sections=placed;loftDrawing=false;
  loftStatus=preset.name+' selected.'+(moved?' Existing sections were repositioned to fit; their item links are kept.':'')+' Save layout when you are happy.';
  renderLoftMap();
}
function loftTransformRoom(action){
  if(!loftDraft||!currentUser?.isSystemAdmin||loftSaving)return;
  loftDraft.outline=loftDraft.outline.map(p=>action==='rotate'?{x:100-p.y,y:p.x}:{x:100-p.x,y:p.y});
  loftDraft.sections=loftSections(loftDraft).map(s=>action==='rotate'?{...s,x:100-s.y-s.h,y:s.x,w:s.h,h:s.w}:{...s,x:100-s.x-s.w});
  loftStatus='Room '+(action==='rotate'?'rotated':'flipped')+'. Save layout to keep this change.';renderLoftMap();
}
function loftNudgeSection(action){
  if(!loftDraft||!currentUser?.isSystemAdmin||loftSaving)return;
  const section=loftSections(loftDraft).find(s=>s.id===loftSelectedSectionId);if(!section)return;
  const next={...section};
  if(action==='left')next.x-=2;if(action==='right')next.x+=2;if(action==='up')next.y-=3;if(action==='down')next.y+=3;
  if(action==='grow'){next.w*=1.12;next.h*=1.12;}if(action==='shrink'){next.w=Math.max(2,next.w/1.12);next.h=Math.max(2,next.h/1.12);}
  if(!LoftGeometry.rectFits(next,loftDraft.outline))return loftSetStatus('That would place the section outside the room. Move it away from the edge or make it smaller.');
  Object.assign(section,next);loftStatus='Section updated. Save layout to keep your changes.';renderLoftMap();
}
function loftTouchControls(){return `<div class="loft-preset-heading">Move section</div><div class="loft-nudge"><button type="button" class="btn btn-secondary" aria-label="Move section left" onclick="loftNudgeSection('left')">←</button><button type="button" class="btn btn-secondary" aria-label="Move section up" onclick="loftNudgeSection('up')">↑</button><button type="button" class="btn btn-secondary" aria-label="Move section down" onclick="loftNudgeSection('down')">↓</button><button type="button" class="btn btn-secondary" aria-label="Move section right" onclick="loftNudgeSection('right')">→</button></div><div class="loft-size-buttons"><button type="button" class="btn btn-secondary" onclick="loftNudgeSection('shrink')">− Smaller</button><button type="button" class="btn btn-secondary" onclick="loftNudgeSection('grow')">＋ Larger</button></div>`;}

