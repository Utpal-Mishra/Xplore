// XPLORE Ireland v0.4.6 — dynamic address autocomplete with explicit confirmation.
//
// Interaction model:
//   type -> debounced Photon suggestions -> user explicitly selects -> route
//
// Photon/OpenStreetMap is a low-volume development adapter for search-as-you-type.
// Production should move autocomplete behind an XPLORE-controlled geocoding service.
// Exact Eircodes keep their dedicated resolver path and are never fuzzy matched.

const XPLORE_AUTOCOMPLETE_ENDPOINT='https://photon.komoot.io/api/';
const XPLORE_AUTOCOMPLETE_DEBOUNCE_MS=360;
const XPLORE_AUTOCOMPLETE_LIMIT=8;
const XPLORE_AUTOCOMPLETE_BBOX='-10.75,51.25,-5.25,55.45';

const xploreAddressState={
  selections:{from:null,to:null},
  suggestions:{from:[],to:[]},
  activeIndex:{from:-1,to:-1},
  timers:{from:null,to:null},
  controllers:{from:null,to:null},
  requests:{from:0,to:0},
  initialised:false
};

function addressStatusElement(fieldId){return $(`${fieldId}AddressStatus`);}
function addressSuggestionsElement(fieldId){return $(`${fieldId}Suggestions`);}
function addressPrompt(fieldId){
  return fieldId==='from'
    ?'Start typing an address or place — suggestions appear automatically.'
    :'Start typing a destination — suggestions appear automatically.';
}

function ensureAddressStyles(){
  let link=document.querySelector('link[data-xplore-address-search]');
  if(link){
    if(!link.href.includes('v=0.4.6'))link.href='address-search.css?v=0.4.6';
    return;
  }
  link=document.createElement('link');
  link.rel='stylesheet';
  link.href='address-search.css?v=0.4.6';
  link.dataset.xploreAddressSearch='true';
  document.head.appendChild(link);
}

function ensureAddressFieldUI(fieldId){
  const input=$(fieldId);if(!input)return;
  const field=input.closest('.field');if(!field)return;
  input.placeholder=fieldId==='from'?'Enter start location':'Enter destination location';
  input.classList.add('field-input','address-autocomplete-input');
  input.setAttribute('role','combobox');
  input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-expanded','false');
  input.setAttribute('aria-controls',`${fieldId}Suggestions`);

  // Remove the legacy explicit "Find address" control if an older module created it.
  const oldButton=$(`${fieldId}AddressSearch`);
  if(oldButton)oldButton.remove();
  const legacyRow=input.closest('.address-input-row');
  if(legacyRow)legacyRow.classList.add('autocomplete-only');

  if(!addressStatusElement(fieldId)){
    const status=document.createElement('div');
    status.id=`${fieldId}AddressStatus`;
    status.className='address-field-status';
    status.textContent=addressPrompt(fieldId);
    input.insertAdjacentElement('afterend',status);
  }

  if(!addressSuggestionsElement(fieldId)){
    const list=document.createElement('div');
    list.id=`${fieldId}Suggestions`;
    list.className='address-suggestions';
    list.hidden=true;
    list.setAttribute('role','listbox');
    list.setAttribute('aria-label',`${fieldId==='from'?'Start':'Destination'} suggestions`);
    addressStatusElement(fieldId).insertAdjacentElement('afterend',list);
  }
}

function escapeAddressHtml(value){
  return String(value??'').replace(/[&<>'\"]/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[char]);
}

function uniqueAddressParts(parts){
  const seen=new Set();
  return parts.filter(part=>{
    const clean=String(part||'').trim();
    if(!clean)return false;
    const key=clean.toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}

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

function addressSearchBias(fieldId){
  const live=state?.livePosition;
  if(live&&Number.isFinite(+live.lat)&&Number.isFinite(+live.lon)){
    return {lat:+live.lat,lon:+live.lon,source:'live'};
  }
  if(fieldId==='to'){
    const start=xploreAddressState.selections.from;
    if(start)return {lat:start.lat,lon:start.lon,source:'start'};
  }
  if(fieldId==='from'){
    const destination=xploreAddressState.selections.to;
    if(destination)return {lat:destination.lat,lon:destination.lon,source:'destination'};
  }
  return {lat:IRELAND_NETWORK?.center?.lat||53.38,lon:IRELAND_NETWORK?.center?.lon||-8.05,source:'ireland'};
}

function haversineDistanceKm(a,b){
  if(!a||!b)return null;
  const rad=value=>value*Math.PI/180;
  const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon);
  const lat1=rad(a.lat),lat2=rad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

function photonFeatureOnIrelandIsland(feature){
  const props=feature?.properties||{};
  const coords=feature?.geometry?.coordinates||[];
  const point={lat:+coords[1],lon:+coords[0]};
  if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||!isInsideIrelandBounds(point))return false;
  const code=String(props.countrycode||props.country_code||'').toUpperCase();
  if(code==='IE')return true;
  const region=[props.state,props.region,props.county,props.district,props.country].filter(Boolean).join(' ').toLowerCase();
  return code==='GB'&&region.includes('northern ireland');
}

function photonFeatureToCandidate(feature,bias){
  const props=feature?.properties||{};
  const coords=feature?.geometry?.coordinates||[];
  const lat=+coords[1],lon=+coords[0];
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;

  const streetLine=uniqueAddressParts([props.housenumber,props.street]).join(' ');
  const primary=props.name||streetLine||props.street||props.city||props.town||props.village||props.locality||'Irish location';
  const secondaryParts=uniqueAddressParts([
    streetLine&&primary!==streetLine?streetLine:null,
    props.district,
    props.city||props.town||props.village||props.locality,
    props.county,
    props.state&&String(props.state).toLowerCase()!=='northern ireland'?props.state:null,
    props.postcode,
    props.country||'Ireland'
  ]).filter(part=>String(part).toLowerCase()!==String(primary).toLowerCase());
  const secondary=secondaryParts.join(', ');
  const label=uniqueAddressParts([primary,...secondaryParts]).join(', ');
  const type=props.type||props.osm_value||props.osm_key||'place';

  return {
    lat,lon,name:label,display_name:label,primary,secondary,label,type,
    provider:'Photon / OpenStreetMap autocomplete',
    distanceKm:haversineDistanceKm(bias,{lat,lon}),
    address:{
      house_number:props.housenumber||null,
      road:props.street||null,
      building:props.name||null,
      suburb:props.district||null,
      neighbourhood:props.locality||null,
      village:props.village||null,
      town:props.town||null,
      city:props.city||null,
      county:props.county||null,
      state:props.state||null,
      postcode:props.postcode||null,
      country:props.country||null,
      country_code:String(props.countrycode||props.country_code||'').toLowerCase()
    },
    raw:feature
  };
}

function candidateKey(item){
  return `${String(item.label||item.name||'').toLowerCase()}|${(+item.lat).toFixed(5)}|${(+item.lon).toFixed(5)}`;
}

async function fetchPhotonSuggestions(fieldId,query,signal){
  const bias=addressSearchBias(fieldId);
  const params=new URLSearchParams({
    q:query,
    limit:String(XPLORE_AUTOCOMPLETE_LIMIT),
    lang:'en',
    bbox:XPLORE_AUTOCOMPLETE_BBOX,
    // Coarsen live/current position before sending it to the public search adapter.
    lat:(Math.round(bias.lat*100)/100).toString(),
    lon:(Math.round(bias.lon*100)/100).toString()
  });
  const response=await fetch(`${XPLORE_AUTOCOMPLETE_ENDPOINT}?${params.toString()}`,{
    signal,
    headers:{Accept:'application/json'}
  });
  if(!response.ok)throw new Error(`Address autocomplete returned ${response.status}`);
  const payload=await response.json();
  const unique=new Map();
  for(const feature of payload.features||[]){
    if(!photonFeatureOnIrelandIsland(feature))continue;
    const item=photonFeatureToCandidate(feature,bias);
    if(!item)continue;
    const key=candidateKey(item);
    if(!unique.has(key))unique.set(key,item);
  }
  return [...unique.values()].slice(0,XPLORE_AUTOCOMPLETE_LIMIT);
}

async function fetchDynamicAddressSuggestions(fieldId,query,signal){
  const original=normaliseIrishAddressText(query);
  let items=await fetchPhotonSuggestions(fieldId,original,signal);
  if(items.length)return items;

  const relaxed=stripUnitOrApartment(original);
  if(relaxed&&relaxed!==original){
    items=await fetchPhotonSuggestions(fieldId,relaxed,signal);
    return items.map(item=>({...item,_xploreRelaxed:true,_xploreMatchLabel:'Building-level suggestion · apartment/unit removed'}));
  }
  return [];
}

function suggestionIcon(type){
  const value=String(type||'').toLowerCase();
  if(value.includes('airport'))return '✈';
  if(value.includes('station')||value.includes('railway'))return '◇';
  if(value.includes('city')||value.includes('town')||value.includes('village'))return '⌂';
  if(value.includes('house')||value.includes('street')||value.includes('building'))return '⌖';
  return '•';
}

function formatSuggestionDistance(value){
  if(!Number.isFinite(value))return '';
  if(value<1)return `${Math.max(50,Math.round(value*1000/50)*50)} m`;
  if(value<10)return `${value.toFixed(1)} km`;
  return `${Math.round(value)} km`;
}

function hideAddressSuggestions(fieldId){
  const list=addressSuggestionsElement(fieldId),input=$(fieldId);
  if(list)list.hidden=true;
  if(input){
    input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');
  }
  xploreAddressState.activeIndex[fieldId]=-1;
}

function setAddressFieldStatus(fieldId,message,tone='normal'){
  const el=addressStatusElement(fieldId);if(!el)return;
  el.textContent=message;
  el.dataset.tone=tone;
}

function clearAddressSelection(fieldId,{keepStatus=false}={}){
  xploreAddressState.selections[fieldId]=null;
  const input=$(fieldId);if(input)input.classList.remove('address-confirmed');
  if(!keepStatus)setAddressFieldStatus(fieldId,addressPrompt(fieldId));
}

function selectedAddress(fieldId){
  const input=$(fieldId),selection=xploreAddressState.selections[fieldId];
  if(!input||!selection)return null;
  if(selection.inputValue!==input.value.trim())return null;
  return {
    lat:selection.lat,lon:selection.lon,name:selection.name,
    eircode:selection.eircode||null,provider:selection.provider||null
  };
}

function confirmAddress(fieldId,location,{status='Address confirmed · ready to route'}={}){
  const input=$(fieldId);if(!input||!location)return null;
  const fullName=location.name||location.label||location.display_name||`${location.lat}, ${location.lon}`;
  input.value=fullName;
  input.classList.add('address-confirmed');
  xploreAddressState.selections[fieldId]={
    lat:+location.lat,lon:+location.lon,name:fullName,
    eircode:location.eircode||null,
    provider:location.provider||'OpenStreetMap autocomplete',
    inputValue:fullName
  };
  hideAddressSuggestions(fieldId);
  setAddressFieldStatus(fieldId,status,'success');
  return selectedAddress(fieldId);
}

function renderAddressSuggestions(fieldId,items,{emptyMessage='No Irish address or place found. Keep typing or add a town/county.'}={}){
  const list=addressSuggestionsElement(fieldId),input=$(fieldId);
  if(!list||!input)return;
  xploreAddressState.suggestions[fieldId]=items;
  xploreAddressState.activeIndex[fieldId]=-1;

  if(!items.length){
    list.innerHTML=`<div class="address-suggestion-empty">${escapeAddressHtml(emptyMessage)}</div>`;
    list.hidden=false;
    input.setAttribute('aria-expanded','true');
    return;
  }

  list.innerHTML=items.map((item,index)=>{
    const distance=formatSuggestionDistance(item.distanceKm);
    const matchNote=item._xploreRelaxed?`<em>${escapeAddressHtml(item._xploreMatchLabel||'Building-level suggestion')}</em>`:'';
    const secondary=item.secondary||item.address?.postcode||'Ireland';
    return `<button type="button" class="address-suggestion" data-address-index="${index}" id="${fieldId}-address-option-${index}" role="option" aria-selected="false">
      <span class="suggestion-icon" aria-hidden="true">${suggestionIcon(item.type)}</span>
      <span class="suggestion-copy"><strong>${escapeAddressHtml(item.primary||item.name)}</strong><small>${escapeAddressHtml(secondary)}</small>${matchNote}</span>
      ${distance?`<span class="suggestion-distance">${escapeAddressHtml(distance)}</span>`:''}
    </button>`;
  }).join('');
  list.hidden=false;
  input.setAttribute('aria-expanded','true');

  list.querySelectorAll('.address-suggestion').forEach(button=>{
    button.addEventListener('click',()=>selectAddressSuggestion(fieldId,+button.dataset.addressIndex));
  });
}

function renderSuggestionStatus(fieldId,message){
  const list=addressSuggestionsElement(fieldId),input=$(fieldId);
  if(!list||!input)return;
  list.innerHTML=`<div class="address-suggestion-empty searching">${escapeAddressHtml(message)}</div>`;
  list.hidden=false;
  input.setAttribute('aria-expanded','true');
}

function selectAddressSuggestion(fieldId,index){
  const item=xploreAddressState.suggestions[fieldId]?.[index];
  if(!item)return null;
  const relaxed=item._xploreRelaxed;
  const status=relaxed
    ?'Building-level address confirmed · apartment/unit itself may not be individually mapped'
    :'Address confirmed · ready to route';
  const confirmed=confirmAddress(fieldId,item,{status});
  setStatus(`${fieldId==='from'?'Start':'Destination'} confirmed. XPLORE will route only to the location you selected.`);
  return confirmed;
}

function updateActiveSuggestion(fieldId,index){
  const list=addressSuggestionsElement(fieldId),input=$(fieldId);
  if(!list||!input)return;
  const buttons=[...list.querySelectorAll('.address-suggestion')];
  if(!buttons.length)return;
  const safe=((index%buttons.length)+buttons.length)%buttons.length;
  xploreAddressState.activeIndex[fieldId]=safe;
  buttons.forEach((button,i)=>{
    const active=i===safe;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
  });
  input.setAttribute('aria-activedescendant',`${fieldId}-address-option-${safe}`);
  buttons[safe].scrollIntoView({block:'nearest'});
}

function cancelAddressSearch(fieldId){
  if(xploreAddressState.timers[fieldId]){
    window.clearTimeout(xploreAddressState.timers[fieldId]);
    xploreAddressState.timers[fieldId]=null;
  }
  if(xploreAddressState.controllers[fieldId]){
    xploreAddressState.controllers[fieldId].abort();
    xploreAddressState.controllers[fieldId]=null;
  }
}

async function runAddressAutocomplete(fieldId){
  const input=$(fieldId);if(!input)return [];
  if(fieldId==='from'&&state.liveTracking){
    hideAddressSuggestions(fieldId);
    setAddressFieldStatus(fieldId,'Live GPS is the active Start location.','success');
    return [];
  }

  const query=input.value.trim();
  if(query.length<2){
    hideAddressSuggestions(fieldId);
    setAddressFieldStatus(fieldId,addressPrompt(fieldId));
    return [];
  }

  const coords=parseCoordinates(query);
  if(coords){
    const item={...coords,primary:'Use entered coordinates',secondary:`${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`,label:query,name:query,type:'coordinates',provider:'Entered coordinates'};
    xploreAddressState.suggestions[fieldId]=[item];
    renderAddressSuggestions(fieldId,[item]);
    setAddressFieldStatus(fieldId,'Choose the coordinate result to confirm it.');
    return [item];
  }

  const requestId=++xploreAddressState.requests[fieldId];
  if(xploreAddressState.controllers[fieldId])xploreAddressState.controllers[fieldId].abort();
  const controller=new AbortController();
  xploreAddressState.controllers[fieldId]=controller;

  const eircode=normalizeEircode(query);
  if(eircode){
    renderSuggestionStatus(fieldId,`Checking exact Eircode ${eircode}…`);
    setAddressFieldStatus(fieldId,`Checking exact Eircode ${eircode}…`,'searching');
    try{
      const resolved=await resolveEircode(eircode);
      if(requestId!==xploreAddressState.requests[fieldId]||input.value.trim()!==query)return [];
      const item={
        lat:+resolved.lat,lon:+resolved.lon,name:resolved.name||eircode,
        label:resolved.name||eircode,display_name:resolved.name||eircode,
        primary:resolved.name||eircode,secondary:`Exact Eircode · ${eircode}`,
        eircode,type:'eircode',provider:resolved.provider||'Eircode resolver',distanceKm:haversineDistanceKm(addressSearchBias(fieldId),{lat:+resolved.lat,lon:+resolved.lon})
      };
      renderAddressSuggestions(fieldId,[item]);
      setAddressFieldStatus(fieldId,'Exact Eircode found · tap the result to confirm.');
      return [item];
    }catch(error){
      if(requestId!==xploreAddressState.requests[fieldId])return [];
      renderAddressSuggestions(fieldId,[],{emptyMessage:`Eircode ${eircode} is not available in the current resolver. Type the building/street and town instead.`});
      setAddressFieldStatus(fieldId,'Exact Eircode unavailable · type the building/street and town instead.','error');
      return [];
    }
  }

  renderSuggestionStatus(fieldId,'Searching Ireland…');
  setAddressFieldStatus(fieldId,'Searching Ireland…','searching');
  try{
    const items=await fetchDynamicAddressSuggestions(fieldId,query,controller.signal);
    if(requestId!==xploreAddressState.requests[fieldId]||input.value.trim()!==query)return [];
    renderAddressSuggestions(fieldId,items);
    if(items.length){
      const relaxed=items.some(item=>item._xploreRelaxed);
      setAddressFieldStatus(fieldId,relaxed?'Choose the mapped building/address suggestion.':'Choose a suggestion to confirm the location.');
    }else{
      setAddressFieldStatus(fieldId,'No matching Irish place found yet · keep typing or add a town/county.','error');
    }
    return items;
  }catch(error){
    if(error?.name==='AbortError')return [];
    console.error('XPLORE address autocomplete failed.',error);
    if(requestId!==xploreAddressState.requests[fieldId])return [];
    renderAddressSuggestions(fieldId,[],{emptyMessage:'Address suggestions are temporarily unavailable. Try again in a moment.'});
    setAddressFieldStatus(fieldId,'Address suggestions are temporarily unavailable.','error');
    return [];
  }finally{
    if(xploreAddressState.controllers[fieldId]===controller)xploreAddressState.controllers[fieldId]=null;
  }
}

function scheduleAddressAutocomplete(fieldId,{immediate=false}={}){
  const input=$(fieldId);if(!input)return;
  if(xploreAddressState.timers[fieldId])window.clearTimeout(xploreAddressState.timers[fieldId]);
  const query=input.value.trim();
  if(query.length<2){
    cancelAddressSearch(fieldId);
    hideAddressSuggestions(fieldId);
    setAddressFieldStatus(fieldId,addressPrompt(fieldId));
    return;
  }
  if(immediate){
    runAddressAutocomplete(fieldId);
    return;
  }
  xploreAddressState.timers[fieldId]=window.setTimeout(()=>{
    xploreAddressState.timers[fieldId]=null;
    runAddressAutocomplete(fieldId);
  },XPLORE_AUTOCOMPLETE_DEBOUNCE_MS);
}

async function confirmedLocationForRoute(fieldId){
  if(fieldId==='from'&&state.liveTracking){
    if(!state.livePosition){setStatus('Waiting for a live GPS fix before routing.',true);return null;}
    return {...state.livePosition,name:'Live location'};
  }

  const selected=selectedAddress(fieldId);
  if(selected)return selected;
  const input=$(fieldId),query=input?.value.trim()||'';
  if(!query){setAddressFieldStatus(fieldId,'Enter a location first.','error');return null;}

  // Explicit coordinates are deterministic and safe to accept when Find routes is pressed.
  const coords=parseCoordinates(query);
  if(coords){
    if(!isInsideIrelandBounds(coords)){setAddressFieldStatus(fieldId,'Coordinates are outside the Ireland pilot.','error');return null;}
    return confirmAddress(fieldId,{...coords,name:query,provider:'Entered coordinates'},{status:'Coordinates confirmed · ready to route'});
  }

  // Exact Eircodes may be resolved directly; ordinary text is never auto-selected.
  const eircode=normalizeEircode(query);
  if(eircode){
    try{
      setAddressFieldStatus(fieldId,`Checking exact Eircode ${eircode}…`,'searching');
      const resolved=await resolveEircode(eircode);
      return confirmAddress(fieldId,resolved,{status:`Eircode ${eircode} resolved exactly · ready to route`});
    }catch(error){
      setAddressFieldStatus(fieldId,'Exact Eircode unavailable · type the building/street and town instead.','error');
      return null;
    }
  }

  await runAddressAutocomplete(fieldId);
  setAddressFieldStatus(fieldId,'Choose one of the suggestions before routing.','error');
  return null;
}

// Routing remains confirmation-first: dynamic suggestions are fast, but XPLORE never
// silently chooses the first fuzzy place result.
planJourney=async function(){
  const fromText=$('from').value.trim(),toText=$('to').value.trim();
  if((!fromText&&!state.liveTracking)||!toText){setStatus('Enter both start and destination.',true);return;}
  if(state.liveTracking&&!state.livePosition){setStatus('Waiting for a live GPS fix before routing.',true);return;}

  const start=await confirmedLocationForRoute('from');
  if(!start){setStatus('Choose a Start suggestion before finding routes.',true);return;}
  const destination=await confirmedLocationForRoute('to');
  if(!destination){setStatus('Choose a Destination suggestion before finding routes.',true);return;}

  resetJourneyPresentation('Calculating the confirmed Ireland journey…');
  document.body.classList.add('loading');
  try{
    setStatus('Requesting routes and live context for the confirmed locations…');
    await routeBetween(start,destination);
    if(state.liveTracking)renderLivePosition(state.livePosition);
  }catch(error){
    console.error(error);
    setStatus(error.message||'Could not calculate this confirmed journey.',true);
  }finally{
    document.body.classList.remove('loading');
  }
};

function initXploreAddressSearch(){
  if(xploreAddressState.initialised)return;
  xploreAddressState.initialised=true;
  ensureAddressStyles();
  ['from','to'].forEach(ensureAddressFieldUI);

  ['from','to'].forEach(fieldId=>{
    const input=$(fieldId);if(!input||input.dataset.addressAutocompleteBound)return;
    input.dataset.addressAutocompleteBound='true';

    input.addEventListener('input',()=>{
      clearAddressSelection(fieldId,{keepStatus:false});
      xploreAddressState.suggestions[fieldId]=[];
      xploreAddressState.activeIndex[fieldId]=-1;
      scheduleAddressAutocomplete(fieldId);
    });

    input.addEventListener('focus',()=>{
      if(!selectedAddress(fieldId)&&input.value.trim().length>=2)scheduleAddressAutocomplete(fieldId,{immediate:true});
    });

    input.addEventListener('blur',()=>window.setTimeout(()=>hideAddressSuggestions(fieldId),180));

    input.addEventListener('keydown',event=>{
      const items=xploreAddressState.suggestions[fieldId]||[];
      if(event.key==='ArrowDown'&&items.length){
        event.preventDefault();
        updateActiveSuggestion(fieldId,xploreAddressState.activeIndex[fieldId]+1);
      }else if(event.key==='ArrowUp'&&items.length){
        event.preventDefault();
        updateActiveSuggestion(fieldId,xploreAddressState.activeIndex[fieldId]-1);
      }else if(event.key==='Enter'){
        event.preventDefault();
        const index=xploreAddressState.activeIndex[fieldId];
        if(index>=0&&items[index])selectAddressSuggestion(fieldId,index);
        else scheduleAddressAutocomplete(fieldId,{immediate:true});
      }else if(event.key==='Escape'){
        hideAddressSuggestions(fieldId);
      }
    });
  });

  document.addEventListener('click',event=>{
    ['from','to'].forEach(fieldId=>{
      const field=$(fieldId)?.closest('.field');
      if(field&&!field.contains(event.target))hideAddressSuggestions(fieldId);
    });
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initXploreAddressSearch,{once:true});
else initXploreAddressSearch();
