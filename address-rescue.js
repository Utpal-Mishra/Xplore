// XPLORE Ireland v0.3.4 — progressive address rescue for unit/apartment inputs.
// Nominatim often has building/street geometry but not individual apartment/unit records.
// XPLORE therefore progressively relaxes the typed query and ALWAYS asks the user
// to confirm the returned full-address suggestion before routing.

const xploreBaseFindAddressCandidates=findAddressCandidates;

function normaliseIrishAddressText(value){
  return String(value||'')
    .replace(/\s+/g,' ')
    .replace(/\s*,\s*/g,', ')
    .replace(/\bCo\.\s+/gi,'County ')
    .trim()
    .replace(/^,+|,+$/g,'')
    .trim();
}

function stripUnitOrApartment(value){
  return normaliseIrishAddressText(value)
    .replace(/^\s*(?:apartment|apt\.?|flat|unit)\s*(?:no\.?\s*)?[#:]?\s*[A-Z0-9-]+\s*,?\s*/i,'')
    .replace(/^\s*(?:apartment|apt\.?|flat|unit)\s*,?\s*/i,'')
    .trim();
}

function stripUnresolvedEircode(value){
  return normaliseIrishAddressText(value)
    .replace(/(?:^|,\s*)(?:[AC-FHKNPRTV-Y]\d{2}|D6W)\s?[0-9AC-FHKNPRTV-Y]{4}(?=\s*(?:,|$))/i,'')
    .replace(/^,+|,+$/g,'')
    .trim();
}

function addressRescueQueries(query){
  const original=normaliseIrishAddressText(query);
  const withoutUnit=stripUnitOrApartment(original);
  const withoutEircode=stripUnresolvedEircode(original);
  const withoutUnitOrEircode=stripUnresolvedEircode(withoutUnit);
  const queries=[
    {query:original,relaxed:false,label:'Exact typed address'},
    {query:withoutUnit,relaxed:withoutUnit!==original,label:'Building-level match (apartment/unit removed)'},
    {query:withoutEircode,relaxed:withoutEircode!==original,label:'Address match without unresolved Eircode'},
    {query:withoutUnitOrEircode,relaxed:withoutUnitOrEircode!==original,label:'Building-level match'}
  ];
  const seen=new Set();
  return queries.filter(item=>{
    const key=item.query.toLowerCase();
    if(item.query.length<3||seen.has(key))return false;
    seen.add(key);return true;
  });
}

findAddressCandidates=async function(query){
  const unique=new Map();
  for(const attempt of addressRescueQueries(query)){
    let items=[];
    try{items=await xploreBaseFindAddressCandidates(attempt.query);}catch(error){console.warn('Address rescue attempt failed.',attempt.query,error);}
    for(const item of items){
      const key=String(item.display_name||'').trim().toLowerCase();
      if(!key||unique.has(key))continue;
      unique.set(key,{...item,_xploreRelaxed:attempt.relaxed,_xploreMatchLabel:attempt.label,_xploreSearchedAs:attempt.query});
    }
    // Once we have useful candidates, avoid unnecessary public-geocoder calls.
    if(unique.size>=3||(!attempt.relaxed&&unique.size))break;
  }
  return [...unique.values()].slice(0,6);
};

renderAddressSuggestions=function(fieldId,items){
  const list=addressSuggestionsElement(fieldId);if(!list)return;
  if(!items.length){
    list.innerHTML='<div class="address-suggestion-empty">No mapped address match was found. Try the building/estate name + town + county (for example: The Quadrants, Ballincollig, Cork).</div>';
    list.hidden=false;
    return;
  }
  list.innerHTML=items.map((item,index)=>{
    const compact=compactAddressLabel(item);
    const matchNote=item._xploreRelaxed?`<em>${escapeAddressHtml(item._xploreMatchLabel||'Nearest mapped address')}</em>`:'';
    return `<button type="button" class="address-suggestion" data-address-index="${index}" role="option"><span>${escapeAddressHtml(item.display_name)}</span>${compact?`<small>${escapeAddressHtml(compact)}</small>`:''}${matchNote}</button>`;
  }).join('');
  list.hidden=false;
  list.querySelectorAll('.address-suggestion').forEach(button=>{
    button.addEventListener('click',()=>{
      const item=items[+button.dataset.addressIndex];if(!item)return;
      const label=item._xploreRelaxed?'Building/address confirmed · apartment/unit itself is not individually mapped':'Full address confirmed · ready to route';
      confirmAddress(fieldId,candidateFromNominatim(item),{status:label});
      setStatus(`${fieldId==='from'?'Start':'Destination'} address confirmed. XPLORE will route only to the address you selected.`);
    });
  });
};

// Re-implement the user-triggered search so a typed address is NEVER auto-selected,
// even when the geocoder returns only one result. Every normal address must be confirmed.
searchFieldAddress=async function(fieldId,{routeIntent=false}={}){
  const input=$(fieldId);if(!input)return null;
  if(fieldId==='from'&&state.liveTracking){
    setAddressFieldStatus(fieldId,'Live GPS is the active Start location.','success');
    return {...state.livePosition,name:'Live location'};
  }

  const query=input.value.trim();
  if(!query){setAddressFieldStatus(fieldId,'Enter an address first.','error');return null;}

  const coords=parseCoordinates(query);
  if(coords){
    if(!isInsideIrelandBounds(coords)){
      setAddressFieldStatus(fieldId,'Coordinates are outside the Ireland pilot.','error');return null;
    }
    return confirmAddress(fieldId,coords,{status:'Coordinates confirmed · ready to route'});
  }

  const eircode=normalizeEircode(query);
  if(eircode){
    setAddressFieldStatus(fieldId,`Checking exact Eircode ${eircode}…`,'searching');
    try{
      const resolved=await resolveEircode(eircode);
      return confirmAddress(fieldId,resolved,{status:`Eircode ${eircode} resolved to a full address`});
    }catch(error){
      hideAddressSuggestions(fieldId);
      setAddressFieldStatus(fieldId,'Eircode unavailable here. Enter the building/street + town + county and choose a suggestion.','error');
      if(routeIntent)setStatus(`Eircode ${eircode} is not resolvable in the current pilot. Enter the building/street + town + county, then choose a suggestion.`,true);
      return null;
    }
  }

  if(query.length<3){setAddressFieldStatus(fieldId,'Enter at least 3 characters.','error');return null;}
  const requestId=++xploreAddressState.searches[fieldId];
  setAddressFieldStatus(fieldId,'Searching exact address, then building-level matches if needed…','searching');
  try{
    const items=await findAddressCandidates(query);
    if(requestId!==xploreAddressState.searches[fieldId])return null;
    renderAddressSuggestions(fieldId,items);
    if(items.length){
      const relaxed=items.some(item=>item._xploreRelaxed);
      setAddressFieldStatus(fieldId,relaxed?`Choose the correct mapped address. Some apartment/unit detail was relaxed to find the building.`:`Choose the correct full address from ${items.length} match${items.length===1?'':'es'}.`,'normal');
      if(routeIntent)setStatus(`Choose the ${fieldId==='from'?'Start':'Destination'} address shown below, then tap Find real routes again.`);
    }else{
      setAddressFieldStatus(fieldId,'No mapped address match found. Try building/estate + town + county.','error');
      if(routeIntent)setStatus('No mapped address match found. Try the building/estate name + town + county.',true);
    }
    return null;
  }catch(error){
    console.error(error);
    setAddressFieldStatus(fieldId,'Address search is temporarily unavailable.','error');
    if(routeIntent)setStatus('Address search is temporarily unavailable.',true);
    return null;
  }
};

function activateAddressRescueV034(){
  const badge=document.querySelector('.header-meta .pill');if(badge)badge.textContent='Ireland v0.3.4';
  if(typeof IRELAND_NETWORK!=='undefined')IRELAND_NETWORK.version='Ireland v0.3.4';
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activateAddressRescueV034,{once:true});
else activateAddressRescueV034();
