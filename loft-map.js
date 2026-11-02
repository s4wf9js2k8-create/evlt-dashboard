// Loft layouts and item links share the Documents permission boundary.
let loftSelectedMapId = '', loftSelectedSectionId = '', loftDraft = null;
let loftDraftRevision = null, loftDrawing = false, loftOutlinePoints = [], loftSearch = '', loftStatus = '', loftSaving = false;
const loftCopy = value => JSON.parse(JSON.stringify(value));
const loftId = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const loftMaps = () => Object.values(db.loftMaps || {}).filter(m => m && m.id && m.name);
const loftSections = map => Array.isArray(map?.sections) ? map.sections.filter(Boolean) : Object.values(map?.sections || {}).filter(Boolean);
function getItemLoftLink(item) {
  const map = (db.loftMaps || {})[item.loftMapId];
  const section = loftSections(map).find(s => s.id === item.loftSectionId);
  return map && section ? { map, section, label: map.name + ' / ' + section.name } : null;
}
function getItemStorageLocation(item) { return getItemLoftLink(item)?.label || item.location || ''; }
function loftMapCurrent() { return loftDraft || (db.loftMaps || {})[loftSelectedMapId] || null; }
function loftSetStatus(text) {
  loftStatus = text;
  const el = document.getElementById('loftStatus');
  if (el) el.textContent = text;
}
function loftSelectMap(id) {
  if (loftDraft && !confirm('Discard your unsaved layout changes?')) return;
  loftDraft = null; loftDrawing = false; loftSelectedSectionId = ''; loftSelectedMapId = id; loftStatus = '';
  renderLoftMap();
}
function loftBeginEdit(isNew = false) {
  if (!currentUser?.isSystemAdmin || loftSaving) return;
  if (isNew && loftDraft && !confirm('Discard your unsaved layout changes?')) return;
  const map = loftMapCurrent();
  loftDraft = isNew ? { id: loftId('loft'), name: 'New loft', outline: LoftGeometry.rectangle(), sections: [] } : map ? loftCopy(map) : null;
  if (!loftDraft) return;
  loftDraftRevision = isNew ? null : (map.updatedAt || null);
  loftSelectedMapId = loftDraft.id; loftSelectedSectionId = ''; loftDrawing = false; loftStatus = '';
  renderLoftMap();
}
function loftCancelEdit() {
  if (loftSaving || (loftDraft && !confirm('Discard your unsaved layout changes?'))) return;
  loftDraft = null; loftDrawing = false; loftStatus = ''; renderLoftMap();
}
function loftStartOutline() {
  if (!loftDraft || !currentUser?.isSystemAdmin || loftSaving) return;
  loftDrawing = true; loftOutlinePoints = []; loftStatus = 'Click each corner around the loft’s outside edge, then choose Finish outline.'; renderLoftMap();
}
function loftFinishOutline() {
  if (!loftDraft || !currentUser?.isSystemAdmin) return;
  if (!LoftGeometry.validOutline(loftOutlinePoints)) return loftSetStatus('Draw at least three corners without crossing the outline over itself.');
  if (loftSections(loftDraft).some(s => !LoftGeometry.rectFits(s, loftOutlinePoints))) return loftSetStatus('This outline would leave a storage section outside the loft. Cancel drawing, then move or remove that section first.');
  loftDraft.outline = loftCopy(loftOutlinePoints); loftDrawing = false; loftStatus = 'Outline updated. Save layout to publish it.'; renderLoftMap();
}
function loftOutlineAction(action) {
  if (!loftDraft) return;
  if (action === 'undo') loftOutlinePoints.pop();
  else if (action === 'cancel') loftDrawing = false;
  renderLoftMap();
}
function loftAddSection(kind = 'box') {
  if (!loftDraft || !currentUser?.isSystemAdmin || loftDrawing || loftSaving) return;
  let rect = null;
  const preset = LOFT_SECTION_PRESETS.find(p => p.id === kind) || LOFT_SECTION_PRESETS[0];
  for (const scale of [1, .65, .35]) {
    const w = Math.max(3,preset.w * scale), h = Math.max(3,preset.h * scale);
    for (let y = 5; y <= 95 - h && !rect; y += 3) for (let x = 5; x <= 95 - w && !rect; x += 3) {
      const candidate = { x, y, w, h };
      const overlaps = loftSections(loftDraft).some(s => x < s.x + s.w && x + w > s.x && y < s.y + s.h && y + h > s.y);
      if (!overlaps && LoftGeometry.rectFits(candidate, loftDraft.outline)) rect = candidate;
    }
    if (rect) break;
  }
  if (!rect) return loftSetStatus('There is no clear space for another section. Resize or move an existing section, or change the outline.');
  const sections = loftSections(loftDraft);
  let number = sections.length + 1;
  while (sections.some(s => s.name === preset.name + ' ' + number)) number++;
  const section = { ...rect, id: loftId('section'), name: preset.name + ' ' + number, color: preset.color };
  loftDraft.sections = [...sections, section]; loftSelectedSectionId = section.id; loftStatus = 'Section added. Tap its button below the map, then use the arrows and size buttons to position it.'; renderLoftMap();
}
function loftUpdateSection(field, value) {
  if (!loftDraft || !currentUser?.isSystemAdmin || loftSaving) return;
  const section = loftSections(loftDraft).find(s => s.id === loftSelectedSectionId);
  if (!section) return;
  if (field === 'name') section.name = String(value).slice(0, 80);
  else if (field === 'color') { if (/^#[0-9a-f]{6}$/i.test(value)) section.color = value; }
  else if (['x', 'y', 'w', 'h'].includes(field)) {
    const candidate = { ...section, [field]: Number(value) };
    if (!LoftGeometry.rectFits(candidate, loftDraft.outline)) { loftSetStatus('Keep the whole section inside the loft outline.'); return renderLoftMap(); }
    Object.assign(section, candidate);
  }
  loftDraft.sections = loftSections(loftDraft);
  // Name inputs keep focus while the drawing updates.
  const label = document.querySelector('[data-loft-label="' + section.id + '"]');
  if (label) label.textContent = section.name;
  if (field !== 'name') renderLoftMap();
}
function loftRemoveSection() {
  if (!loftDraft || !currentUser?.isSystemAdmin) return;
  const section = loftSections(loftDraft).find(s => s.id === loftSelectedSectionId);
  if (!section) return;
  if ((db.itemCodes || []).some(i => i.loftMapId === loftDraft.id && i.loftSectionId === section.id)) return loftSetStatus('Move the items assigned to this section before removing it.');
  if (!confirm('Remove this section from the layout? Save layout to publish this change.')) return;
  loftDraft.sections = loftSections(loftDraft).filter(s => s.id !== section.id); loftSelectedSectionId = ''; renderLoftMap();
}
async function loftSaveLayout() {
  if (!loftDraft || !currentUser?.isSystemAdmin || loftSaving) return;
  if (loftDrawing) return loftSetStatus('Finish or cancel drawing the outline before saving.');
  const map = loftCopy(loftDraft); map.name = String(map.name || '').trim(); map.sections = loftSections(map);
  if ((db.itemCodes || []).some(i => i.loftMapId === map.id && i.loftSectionId && !map.sections.some(s => s.id === i.loftSectionId))) return loftSetStatus('An item is linked to a section you removed. Restore that section or cancel editing and move the item first.');
  if (!map.name || map.name.length > 80) return loftSetStatus('Give this loft a name of up to 80 characters.');
  if (loftMaps().some(m => m.id !== map.id && m.name.trim().toLowerCase() === map.name.toLowerCase())) return loftSetStatus('Another loft already has that name. Choose a different name.');
  if (!LoftGeometry.validOutline(map.outline) || map.sections.some(s => !s.name.trim() || !LoftGeometry.rectFits(s, map.outline))) return loftSetStatus('Name each section and keep it inside a valid loft outline.');
  if (new Set(map.sections.map(s => s.name.trim().toLowerCase())).size !== map.sections.length) return loftSetStatus('Use a different name for each section in this loft.');
  map.sections.forEach(s => { s.name = s.name.trim(); });
  map.updatedAt = Date.now(); map.updatedBy = currentUser.name || currentUser.email || '';
  loftSaving = true; renderLoftMap();
  try {
    const result = await database.ref('EVLT_ADMIN_DB/loftMaps/' + map.id).transaction(previous => {
      if ((previous?.updatedAt || null) !== loftDraftRevision) return;
      return map;
    });
    if (!result.committed) { loftSaving = false; return loftSetStatus('Another admin has changed this loft. Your draft is kept here. Cancel editing to load their version before making your changes again.'); }
    db.loftMaps = { ...(db.loftMaps || {}), [map.id]: map };
    loftDraft = null; loftDrawing = false; loftStatus = 'Layout saved.';
  } catch (error) { console.error('Could not save loft layout:', error); loftStatus = 'Could not save the layout. Your draft is kept; check your connection and try again.'; }
  finally { loftSaving = false; renderLoftMap(); }
}
function loftSelectSection(id) { loftSelectedSectionId = id; loftStatus = ''; renderLoftMap(); }
function loftOpenItem(id) { docsSubView = 'items'; renderDocuments(); openItemCodeForm(id); }
function showItemOnLoftMap(id) {
  const item = (db.itemCodes || []).find(i => String(i.id) === String(id));
  const link = item && getItemLoftLink(item);
  if (!link) return;
  if (loftDraft && !confirm('Discard your unsaved layout changes?')) return;
  loftDraft = null; loftDrawing = false; loftSelectedMapId = link.map.id; loftSelectedSectionId = link.section.id; loftSearch = ''; docsSubView = 'lofts'; renderDocuments();
}
function loftSetSearch(value) {
  loftSearch = value; const input = document.getElementById('loftItemSearch'); const cursor = input?.selectionStart;
  renderLoftMap(); const replacement = document.getElementById('loftItemSearch'); replacement?.focus(); if (cursor !== undefined && cursor !== null) replacement?.setSelectionRange(cursor, cursor);
}
async function loftAssignItem(event) {
  event.preventDefault();
  if (!canEditFeature('documents') || loftDraft) return;
  const map = loftMapCurrent(), section = loftSections(map).find(s => s.id === loftSelectedSectionId);
  const id = document.getElementById('loftAssignItemSelect')?.value;
  if (!map || !section || !id) return;
  const button = event.submitter; if (button) button.disabled = true;
  try {
    const result = await database.ref('EVLT_ADMIN_DB/itemCodes').transaction(value => {
      const records = Array.isArray(value) ? value.filter(Boolean) : Object.values(value || {}).filter(Boolean);
      const item = records.find(i => String(i.id) === id);
      if (!item) return;
      Object.assign(item, { loftMapId: map.id, loftSectionId: section.id, location: map.name + ' / ' + section.name, updatedAt: new Date().toISOString(), updatedBy: currentUser.name || currentUser.email || '' });
      return records;
    });
    if (!result.committed) return loftSetStatus('This item was removed. Refresh the register and choose another item.');
    db.itemCodes = result.snapshot.val() || []; loftStatus = 'Item assigned to ' + section.name + '.'; renderLoftMap();
  } catch (error) { console.error(error); loftSetStatus('Could not assign the item. Check your connection and try again.'); }
  finally { if (button) button.disabled = false; }
}
function itemLoftZoneOptions(selected = '') {
  return '<option value="">No map section — use storage location below</option>' + loftMaps().map(map => '<optgroup label="' + escapeHtml(map.name) + '">' + loftSections(map).map(section => {
    const key = map.id + '|' + section.id;
    return '<option value="' + escapeHtml(key) + '" ' + (key === selected ? 'selected' : '') + '>' + escapeHtml(section.name) + '</option>';
  }).join('') + '</optgroup>').join('');
}
function selectedItemLoftZone() {
  const value = document.getElementById('itemLoftZone')?.value || '';
  const [mapId, sectionId] = value.split('|');
  const map = (db.loftMaps || {})[mapId], section = loftSections(map).find(s => s.id === sectionId);
  return map && section ? { mapId, sectionId, label: map.name + ' / ' + section.name } : null;
}
function itemLoftSelectionChanged() {
  const link = selectedItemLoftZone();
  if (link) setItemCodeChoiceValue('location', link.label);
  ['itemCodeLocationSelect', 'itemCodeLocationCustom'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !!link; });
}
function renderLoftMap() {
  stopItemCodeCamera();
  if (loftDraft && !currentUser?.isSystemAdmin) { loftDraft = null; loftDrawing = false; }
  const maps = loftMaps();
  if (!loftDraft && !maps.some(m => m.id === loftSelectedMapId)) { loftSelectedMapId = maps[0]?.id || ''; loftSelectedSectionId = ''; }
  const map = loftMapCurrent(), sections = loftSections(map), isAdmin = !!currentUser?.isSystemAdmin, editing = !!loftDraft;
  const selected = sections.find(s => s.id === loftSelectedSectionId);
  const records = (db.itemCodes || []).filter(Boolean);
  const query = loftSearch.trim().toLowerCase();
  const matches = records.filter(i => !query || [i.itemCode, i.itemName, getItemStorageLocation(i), i.category, i.notes].some(v => String(v || '').toLowerCase().includes(query)));
  const assigned = matches.filter(i => i.loftMapId === map?.id && (!selected || i.loftSectionId === selected.id));
  const count = id => records.filter(i => i.loftMapId === map?.id && i.loftSectionId === id).length;
  const choices = editing && !maps.some(m => m.id === map.id) ? [...maps, map] : maps;
  document.getElementById('content').innerHTML = `${docsTabsHtml()}
    <div class="page-header"><div class="page-title"><h2>Loft storage map</h2><p>Find where items belong, or choose a section to see its contents.</p></div>${isAdmin ? '<button type="button" class="btn btn-primary btn-sm" onclick="loftBeginEdit(true)">Add loft</button>' : ''}</div>
    <div class="loft-toolbar ${editing ? 'loft-edit-toolbar' : ''}">${choices.length ? `<label for="loftMapSelect">Loft</label><select id="loftMapSelect" onchange="loftSelectMap(this.value)" ${editing ? 'disabled' : ''}>${choices.map(m => `<option value="${escapeHtml(m.id)}" ${m.id === map?.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}</select>` : ''}
      <input id="loftItemSearch" class="loft-search" type="search" aria-label="Find an item on the loft maps" placeholder="Find an item by code, name or location…" value="${escapeHtml(loftSearch)}" oninput="loftSetSearch(this.value)">
      ${map && isAdmin ? editing ? `<button class="btn btn-primary btn-sm" onclick="loftSaveLayout()" ${loftSaving ? 'disabled' : ''}>${loftSaving ? 'Saving…' : 'Save layout'}</button><button class="btn btn-secondary btn-sm" onclick="loftCancelEdit()" ${loftSaving ? 'disabled' : ''}>Cancel editing</button>` : '<button class="btn btn-secondary btn-sm" onclick="loftBeginEdit()">Edit layout</button>' : ''}</div>
    <p id="loftStatus" class="loft-status" role="status" aria-live="polite">${escapeHtml(loftStatus)}</p>
    ${map ? `${editing ? '<div class="loft-draft-note">Editing this layout. Choose Save layout to publish your changes.</div>' : ''}
    <div class="loft-layout"><div class="card loft-plan ${editing ? 'is-editing' : ''}">
      ${editing ? `<label for="loftMapName">Loft name</label><input id="loftMapName" maxlength="80" value="${escapeHtml(map.name)}" oninput="loftDraft.name=this.value" ${loftSaving ? 'disabled' : ''}>
        <div class="loft-outline-tools">${loftDrawing ? `<button class="btn btn-primary btn-sm" onclick="loftFinishOutline()">Finish outline</button><button class="btn btn-secondary btn-sm" onclick="loftOutlineAction('undo')">Undo corner</button><button class="btn btn-secondary btn-sm" onclick="loftOutlineAction('cancel')">Cancel drawing</button>` : `<details class="loft-preset-panel" ${selected ? '' : 'open'}><summary>Room shape &amp; storage presets</summary>${loftPresetButtons()}</details>`}</div>` : ''}
      <p class="loft-help">${loftDrawing ? 'Click each corner around the outside of your loft in order. Use Finish outline to close the shape.' : editing ? 'Choose a room shape, then tap a storage preset. Select a section below the map to move it with the arrows or change its size.' : 'Click a coloured section to see the items stored there. Use the section buttons below on any screen size.'}</p>
      <svg id="loftCanvas" viewBox="0 0 1000 600" role="img" aria-label="${escapeHtml(map.name)} storage layout">
        <defs><pattern id="loftGrid" width="50" height="30" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 30" fill="none" stroke="#dce5df" stroke-width="1"/></pattern></defs><rect width="1000" height="600" fill="url(#loftGrid)"/>
        <polygon points="${(map.outline || []).map(p => p.x * 10 + ',' + p.y * 6).join(' ')}" fill="#fff" stroke="#476254" stroke-width="4"/>
        ${sections.map(s => { const highlighted = query && matches.some(i => i.loftMapId === map.id && i.loftSectionId === s.id); return `<g class="loft-zone" data-section="${escapeHtml(s.id)}" role="button" tabindex="0" aria-label="${escapeHtml(s.name)}, ${count(s.id)} items" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();loftSelectSection(${inlineJsArg(s.id)})}">
          <rect class="${highlighted ? 'loft-match' : ''}" x="${s.x * 10}" y="${s.y * 6}" width="${s.w * 10}" height="${s.h * 6}" rx="5" fill="${/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#c7e2d5'}" stroke="${selected?.id === s.id ? '#173e2e' : '#729380'}" stroke-width="${selected?.id === s.id ? 4 : 2}"/>
          <svg x="${s.x * 10 + 5}" y="${s.y * 6 + 4}" width="${Math.max(0, s.w * 10 - 10)}" height="${Math.max(0, s.h * 6 - 8)}" style="pointer-events:none;overflow:hidden"><text data-loft-label="${escapeHtml(s.id)}" x="5" y="20" font-size="16" fill="#173e2e" class="loft-zone-label">${escapeHtml(s.name)}</text><text x="5" y="40" font-size="13" fill="#3f5c4d">${count(s.id)} item${count(s.id) === 1 ? '' : 's'}</text></svg>
          ${editing && selected?.id === s.id && !loftDrawing ? `<rect data-resize="true" x="${(s.x + s.w) * 10 - 14}" y="${(s.y + s.h) * 6 - 14}" width="14" height="14" rx="2" fill="#173e2e" style="cursor:nwse-resize"/>` : ''}</g>`; }).join('')}
        ${loftDrawing ? `<polyline points="${loftOutlinePoints.map(p => p.x * 10 + ',' + p.y * 6).join(' ')}" fill="#e4b64222" stroke="#ad7600" stroke-width="4" stroke-dasharray="8 5"/>${loftOutlinePoints.map(p => `<circle cx="${p.x * 10}" cy="${p.y * 6}" r="6" fill="#ad7600"/>`).join('')}` : ''}
      </svg>
      ${editing && selected && !loftDrawing ? `<div class="loft-map-tap-controls"><strong>${escapeHtml(selected.name)}</strong>${loftTouchControls()}</div>` : ''}
      <div class="loft-section-list"><button class="btn btn-secondary btn-sm" onclick="loftSelectSection('')">All sections</button>${sections.map(s => `<button class="btn ${selected?.id === s.id ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="loftSelectSection(${inlineJsArg(s.id)})">${escapeHtml(s.name)} (${count(s.id)})</button>`).join('')}</div>
      ${!sections.length ? '<p class="loft-help">No storage sections yet. An admin can use Edit layout to add them.</p>' : ''}
    </div><aside class="card loft-side">${editing && selected ? `<h3>Edit storage section</h3><div class="form-group"><label for="loftSectionName">Section name</label><input id="loftSectionName" maxlength="80" value="${escapeHtml(selected.name)}" oninput="loftUpdateSection('name',this.value)"></div><div class="form-group"><label for="loftSectionColor">Colour</label><input type="color" id="loftSectionColor" value="${/^#[0-9a-f]{6}$/i.test(selected.color) ? selected.color : '#c7e2d5'}" onchange="loftUpdateSection('color',this.value)"></div>
      <details class="loft-advanced"><summary>Exact position &amp; size</summary><div class="loft-number-grid">${[['x', 'Across (%)'], ['y', 'Down (%)'], ['w', 'Width (%)'], ['h', 'Height (%)']].map(([key,label]) => `<label>${label}<input type="number" min="${key === 'w' || key === 'h' ? 2 : 0}" max="100" step="0.5" value="${Math.round(selected[key] * 10) / 10}" onchange="loftUpdateSection('${key}',this.value)"></label>`).join('')}</div></details><div class="loft-row-actions"><button class="btn btn-danger btn-sm" onclick="loftRemoveSection()">Remove section</button></div>` : `<h3>${selected ? escapeHtml(selected.name) : 'Items in this loft'}</h3>
      <p class="loft-help">${assigned.length} matching item${assigned.length === 1 ? '' : 's'}${selected ? ' in this section' : ' assigned to this loft'}.</p>
      ${assigned.length ? assigned.map(item => `<div class="loft-item"><strong>${escapeHtml(item.itemName)}</strong><br><code>${escapeHtml(item.itemCode)}</code><br><span>${escapeHtml(getItemStorageLocation(item))}</span>${canEditFeature('documents') ? `<br><button class="btn btn-secondary btn-sm" onclick="loftOpenItem(${inlineJsArg(item.id)})">Edit item</button>` : ''}</div>`).join('') : '<p class="loft-help">No items match here. Choose another section or change the search.</p>'}
      ${selected && !editing && canEditFeature('documents') ? `<form onsubmit="loftAssignItem(event)" style="margin-top:1rem"><label for="loftAssignItemSelect">Assign an existing item here</label><select id="loftAssignItemSelect" required><option value="">Choose an item</option>${records.slice().sort((a,b) => String(a.itemCode).localeCompare(String(b.itemCode),undefined,{numeric:true})).map(i => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.itemCode + ' — ' + i.itemName)}</option>`).join('')}</select><button class="btn btn-primary btn-sm" type="submit" style="margin-top:.5rem">Assign to this section</button></form>` : ''}
      ${editing && !selected ? '<p class="loft-help">Select a section to name, resize or remove it. Items can be assigned after you save the layout.</p>' : ''}`}</aside></div>
      ${query ? `<div class="card" style="padding:1rem;margin-top:1rem"><strong>Search across all locations</strong>${matches.length ? matches.map(i => `<div class="loft-item"><strong>${escapeHtml(i.itemName)}</strong> · <code>${escapeHtml(i.itemCode)}</code><br>${getItemLoftLink(i) ? `<button class="loft-location-link" onclick="showItemOnLoftMap(${inlineJsArg(i.id)})">${escapeHtml(getItemStorageLocation(i))} — show on map</button>` : escapeHtml(i.location || 'Not assigned to a map section')}</div>`).join('') : '<p class="loft-help">No matching items.</p>'}</div>` : ''}` : `<div class="card loft-empty"><h3>Create a map of your loft storage</h3><p class="loft-help">${isAdmin ? 'Choose Add loft, draw the outline of the space, then add and name storage sections.' : 'An admin can create a loft layout and add storage sections here.'}</p></div>`}`;
  bindLoftCanvas();
}
function bindLoftCanvas() {
  const canvas = document.getElementById('loftCanvas'); if (!canvas) return;
  let drag = null;
  const point = event => { const matrix = canvas.getScreenCTM(); if (!matrix) return null; const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); return { x: LoftGeometry.clamp(p.x / 10, 0, 100), y: LoftGeometry.clamp(p.y / 6, 0, 100) }; };
  canvas.addEventListener('click', event => {
    if (!loftDrawing || !loftDraft || loftSaving) return;
    const p = point(event); if (!p) return;
    if (loftOutlinePoints.length >= 50) return loftSetStatus('Use up to 50 corners for the outline.');
    loftOutlinePoints.push({ x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 }); renderLoftMap();
  });
  canvas.addEventListener('pointerdown', event => {
    if (loftSaving) return;
    const p = point(event); if (!p) return;
    if (loftDrawing && loftDraft) return;
    const target = event.target.closest('[data-section]'); if (!target) return;
    const id = target.dataset.section;
    if (!loftDraft) { loftSelectSection(id); return; }
    const section = loftSections(loftDraft).find(s => s.id === id); if (!section) return;
    if (event.pointerType === 'touch') { loftSelectSection(id); return; }
    loftSelectedSectionId = id;
    drag = { p, original: { ...section }, section, resize: !!event.target.closest('[data-resize]'), target, moved: false };
    canvas.setPointerCapture(event.pointerId); event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || !loftDraft) return;
    const p = point(event); if (!p) return;
    const dx = p.x - drag.p.x, dy = p.y - drag.p.y;
    const candidate = { ...drag.original };
    if (drag.resize) { candidate.w = Math.max(2, Math.round((candidate.w + dx) * 2) / 2); candidate.h = Math.max(2, Math.round((candidate.h + dy) * 2) / 2); }
    else { candidate.x = Math.round((candidate.x + dx) * 2) / 2; candidate.y = Math.round((candidate.y + dy) * 2) / 2; }
    if (!LoftGeometry.rectFits(candidate, loftDraft.outline)) return;
    drag.moved = Math.abs(dx) + Math.abs(dy) > 0.2;
    Object.assign(drag.section, candidate);
    const r = drag.target.querySelector('rect'); r.setAttribute('x', candidate.x * 10); r.setAttribute('y', candidate.y * 6); r.setAttribute('width', candidate.w * 10); r.setAttribute('height', candidate.h * 6);
    const label = drag.target.querySelector('svg'); label.setAttribute('x', candidate.x * 10 + 5); label.setAttribute('y', candidate.y * 6 + 4); label.setAttribute('width', Math.max(0,candidate.w * 10 - 10)); label.setAttribute('height', Math.max(0,candidate.h * 6 - 8));
    const handle = drag.target.querySelector('[data-resize]'); if (handle) { handle.setAttribute('x', (candidate.x + candidate.w) * 10 - 14); handle.setAttribute('y', (candidate.y + candidate.h) * 6 - 14); }
  });
  const end = () => { if (!drag) return; drag = null; renderLoftMap(); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
}

