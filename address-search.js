// XPLORE Ireland v0.3.3 — explicit, user-triggered full-address selection.
// Public Nominatim must not be used for client-side keystroke autocomplete.
// XPLORE therefore searches only after an explicit user action (button, Enter,
// or Find real routes) and requires a confirmed full address before routing.

const xploreAddressState={
  selections:{from:null,to:null},
  searches:{from:0,to:0},
  initialised:false
};

// Nominatim public policy caps an application at 1 request/second. Serialise all
// lookup calls used by this browser pilot and leave a small safety margin.
const xploreRawNominatimSearch=nominatimSearch;
let xploreNominatimLastStartedAt=0;
let xploreNominatimQueue=Promise.resolve();
nominatimSearch=function(params){
  const run=async()=>{
    const wait=Math.max(0,1100-(Date.now()-xploreNominatimLastStartedAt));
    if(wait)await new Promise(resolve=>window.setTimeout(resolve,wait));
    xploreNominatimLastStartedAt=Date.now();
    return xploreRawNominatimSearch(params);
  };
  const next=xploreNominatimQueue.then(run,run);
  xploreNominatimQueue=next.catch(()=>{});
  return next;
};

function addressStatusElement(fieldId){return $(`${fieldId}AddressStatus`);}
function addressSuggestionsElement(fieldId){return $(`${fieldId}Suggestions`);}

function ensureAddressStyles(){
  if(document.querySelector('link[data-xplore-address-search]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='address-search.css?v=0.3.3';link.dataset.xploreAddressSearch='true';
  document.head.appendChild(link);
}

function ensureAddressFieldUI(fieldId){
  const input=$(fieldId);if(!input)return;
  const field=input.closest('.field');if(!field)return;

  let row=input.closest('.address-input-row');
  if(!row){
    row=document.createElement('div');row.className='address-input-row';
    input.parentNode.insertBefore(row,input);row.appendChild(input);
    input.classList.add('field-input');

    const button=document.createElement('button');
    button.type='button';button.id=`${fieldId}AddressSearch`;button.className='address-search-button';
    button.textContent='Find address';button.setAttribute('aria-label',`Find full ${fieldId==='from'?'start':'destination'} address`);
    row.appendChild(button);
  }

  if(!addressStatusElement(fieldId)){
    const status=document.createElement('div');status.id=`${fieldId}AddressStatus`;status.className='address-field-status';
    status.textContent='Type a full address or request address suggestions.';
    row.insertAdjacentElement('afterend',status);
  }

  if(!addressSuggestionsElement(fieldId)){
    const list=document.createElement('div');list.id=`${fieldId}Suggestions`;list.className='address-suggestions';
    list.hidden=true;list.setAttribute('role','listbox');list.setAttribute('aria-label',`${fieldId==='from'?'Start':'Destination'} address suggestions`);
    addressStatusElement(fieldId).insertAdjacentElement('afterend',list);
  }
}

function escapeAddressHtml(value){
  return String(value??'').replace(/[&<>'"]/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[char]);
}

function compactAddressLabel(item){
  const a=item?.address||{};
  return [a.house_number&&a.road?`${a.house_number} ${a.road}`:a.road||a.pedestrian||a.building||a.amenity||a.shop||a.tourism||a.leisure,
    a.suburb||a.neighbourhood||a.village||a.town||a.city,
    a.county,
    a.postcode].filter(Boolean).join(' · ');
}

function hideAddressSuggestions(fieldId){
  const list=addressSuggestionsElement(fieldId);
  if(list){list.hidden=true;list.innerHTML='';}
}

function setAddressFieldStatus(fieldId,message,tone='normal'){
  const el=addressStatusElement(fieldId);if(!el)return;
  el.textContent=message;
  el.dataset.tone=tone;
}

function clearAddressSelection(fieldId,{keepStatus=false}={}){
  xploreAddressState.selections[fieldId]=null;
  const input=$(fieldId);if(input)input.classList.remove('address-confirmed');
  if(!keepStatus)setAddressFieldStatus(fieldId,'Type a full address or request address suggestions.');
}

function selectedAddress(fieldId){
  const input=$(fieldId),selection=xploreAddressState.selections[fieldId];
  if(!input||!selection)return null;
  if(selection.inputValue!==input.value.trim())return null;
  return {lat:selection.lat,lon:selection.lon,name:selection.name,eircode:selection.eircode||null,provider:selection.provider||null};
}

function confirmAddress(fieldId,location,{status='Full address selected'}={}){
  const input=$(fieldId);if(!input||!location)return null;
  const fullName=location.name||location.display_name||`${location.lat}, ${location.lon}`;
  input.value=fullName;
  input.classList.add('address-confirmed');
  xploreAddressState.selections[fieldId]={
    lat:+location.lat,lon:+location.lon,name:fullName,
    eircode:location.eircode||null,provider:location.provider||'OpenStreetMap address search',
    inputValue:fullName
  };
  hideAddressSuggestions(fieldId);
  setAddressFieldStatus(fieldId,status,'success');
  return selectedAddress(fieldId);
}

function candidateFromNominatim(item){
  return {
    lat:+item.lat,lon:+item.lon,name:item.display_name,
    provider:'OpenStreetMap address search',raw:item
  };
}

async function findAddressCandidates(query){
  let data=await irelandGeocodeRequest(query);
  let results=data.filter(isIrishSearchResult);
  if(!results.length){
    data=await irelandGeocodeRequest(query,{fallback:true});
    results=data.filter(isIrishSearchResult);
  }
  const unique=new Map();
  for(const item of results){
    const key=String(item.display_name||'').trim().toLowerCase();
    if(key&&!unique.has(key))unique.set(key,item);
  }
  return [...unique.values()].slice(0,6);
}

function renderAddressSuggestions(fieldId,items){
  const list=addressSuggestionsElement(fieldId);if(!list)return;
  if(!items.length){
    list.innerHTML='<div class="address-suggestion-empty">No full-address matches were found. Add a street/building and town or county, then search again.</div>';
    list.hidden=false;
    return;
  }
  list.innerHTML=items.map((item,index)=>{
    const compact=compactAddressLabel(item);
    return `<button type="button" class="address-suggestion" data-address-index="${index}" role="option"><span>${escapeAddressHtml(item.display_name)}</span>${compact?`<small>${escapeAddressHtml(compact)}</small>`:''}</button>`;
  }).join('');
  list.hidden=false;
  list.querySelectorAll('.address-suggestion').forEach(button=>{
    button.addEventListener('click',()=>{
      const item=items[+button.dataset.addressIndex];if(!item)return;
      confirmAddress(fieldId,candidateFromNominatim(item),{status:'Full address confirmed · ready to route'});
      setStatus(`${fieldId==='from'?'Start':'Destination'} address confirmed.`);
    });
  });
}

async function searchFieldAddress(fieldId,{routeIntent=false}={}){
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
      setAddressFieldStatus(fieldId,'Eircode unavailable here. Enter street/building + town, then choose a full-address suggestion.','error');
      if(routeIntent)setStatus(`Eircode ${eircode} is not resolvable in the current pilot. Enter a street/building and town, then choose the full address suggestion.`,true);
      return null;
    }
  }

  if(query.length<3){setAddressFieldStatus(fieldId,'Enter at least 3 characters.','error');return null;}
  const requestId=++xploreAddressState.searches[fieldId];
  setAddressFieldStatus(fieldId,'Searching full addresses…','searching');
  try{
    const items=await findAddressCandidates(query);
    if(requestId!==xploreAddressState.searches[fieldId])return null;
    if(items.length===1){
      return confirmAddress(fieldId,candidateFromNominatim(items[0]),{status:'One matching full address confirmed · ready to route'});
    }
    renderAddressSuggestions(fieldId,items);
    setAddressFieldStatus(fieldId,items.length?`Choose one of ${items.length} full-address matches.`:'No full-address matches found.',items.length?'normal':'error');
    if(routeIntent&&items.length)setStatus(`Choose the full ${fieldId==='from'?'Start':'Destination'} address from the suggestions, then tap Find real routes again.`);
    return null;
  }catch(error){
    console.error(error);
    setAddressFieldStatus(fieldId,'Address search is temporarily unavailable.','error');
    if(routeIntent)setStatus('Address search is temporarily unavailable.',true);
    return null;
  }
}

// Override routing so typed place text is never silently converted into an arbitrary result.
planJourney=async function(){
  const fromText=$('from').value.trim(),toText=$('to').value.trim();
  if((!fromText&&!state.liveTracking)||!toText){setStatus('Enter both start and destination.',true);return;}
  if(state.liveTracking&&!state.livePosition){setStatus('Waiting for a live GPS fix before routing.',true);return;}

  let start=state.liveTracking?{...state.livePosition,name:'Live location'}:selectedAddress('from');
  if(!start){
    start=await searchFieldAddress('from',{routeIntent:true});
    if(!start)return;
  }

  let destination=selectedAddress('to');
  if(!destination){
    destination=await searchFieldAddress('to',{routeIntent:true});
    if(!destination)return;
  }

  resetJourneyPresentation('Calculating the confirmed Ireland journey…');
  document.body.classList.add('loading');
  try{
    setStatus('Requesting routes and live context for the confirmed addresses…');
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
    const input=$(fieldId),button=$(`${fieldId}AddressSearch`);
    if(button&&!button.dataset.bound){
      button.dataset.bound='true';
      button.addEventListener('click',()=>searchFieldAddress(fieldId));
    }
    if(input&&!input.dataset.addressSearchBound){
      input.dataset.addressSearchBound='true';
      input.addEventListener('input',()=>{
        clearAddressSelection(fieldId,{keepStatus:false});
        hideAddressSuggestions(fieldId);
      });
      input.addEventListener('keydown',event=>{
        if(event.key==='Enter'){
          event.preventDefault();
          searchFieldAddress(fieldId);
        }
      });
    }
  });

  document.addEventListener('click',event=>{
    ['from','to'].forEach(fieldId=>{
      const field=$(fieldId)?.closest('.field');
      if(field&&!field.contains(event.target))hideAddressSuggestions(fieldId);
    });
  });

  const badge=document.querySelector('.header-meta .pill');if(badge)badge.textContent='Ireland v0.3.3';
  if(typeof IRELAND_NETWORK!=='undefined')IRELAND_NETWORK.version='Ireland v0.3.3';
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initXploreAddressSearch,{once:true});
else initXploreAddressSearch();
