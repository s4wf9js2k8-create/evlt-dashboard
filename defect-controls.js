function evltPrepareDefectAsset(existing=''){
  const select=document.getElementById('incidentLoco'),other=document.getElementById('incidentOtherAsset');
  const names=[...new Set((db.fleetItems||[]).filter(f=>f&&['Steam','Diesel','Electric'].includes(f.type)).map(f=>f.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  select.innerHTML='<option value="">Choose a locomotive or Other…</option>'+names.map(name=>'<option value="'+escapeHtml(name)+'">'+escapeHtml(name)+'</option>').join('')+'<option value="__OTHER_ASSET__">Other asset / location</option>';
  const known=names.includes(existing);select.value=known?existing:existing?'__OTHER_ASSET__':'';other.value=known?'':existing;
  evltSyncDefectAsset();
}
function evltSyncDefectAsset(){
  const select=document.getElementById('incidentLoco'),other=document.getElementById('incidentOtherAsset'),custom=select.value==='__OTHER_ASSET__';
  document.getElementById('incidentOtherGroup').hidden=!custom;other.required=custom;other.setCustomValidity('');
  document.getElementById('incidentAsset').value=custom?other.value.trim():select.value;
}
function evltValidateDefectAsset(form){evltSyncDefectAsset();const select=document.getElementById('incidentLoco'),other=document.getElementById('incidentOtherAsset');if(select.value==='__OTHER_ASSET__'&&!other.value.trim())other.setCustomValidity('Enter the asset or location involved.');return form.reportValidity();}
