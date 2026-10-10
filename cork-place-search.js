// Local OSM coverage plus separately sourced address-level corrections.
const corkPlaceSearch={places:[],loaded:false,loading:null,cache:new Map(),storageKey:'xplore-personal-places-v1',pickHandler:null};
const corkAddressCorrections=[{
  id:'desi-bites-cork-estate',name:'Desi Bites Cafe & Restaurant',aliases:['Desi Bites','Desi Bites Cafe and Restaurant'],
  address:'John Harrington Industrial Estate, Tramore Road, Ballyphehane, Cork',lat:51.8759212,lon:-8.481984,
  type:'restaurant',precision:'estate',source:'https://desibites.ie/contact',coordinateSource:'https://www.openstreetmap.org/way/75862158',verifiedAt:'2026-10-11',
  note:'Estate-level pin · restaurant entrance not verified'
}];
function placeWords(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\brd\b/gi,'road').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}
function placeNameQuery(query){return normaliseIrishAddressText(query).split(/\s+at\s+|,/i)[0].trim();}
function placeNameTokens(value){return placeWords(value).split(' ').filter(t=>t&&!['and','the','cork','ireland','cafe','restaurant'].includes(t));}
function matchingPlaceScore(query,place){
  const tokens=placeNameTokens(placeNameQuery(query));if(!tokens.length)return 0;
  // A Cork correction must not override an explicitly named different city.
  if(/\b(dublin|galway|limerick|waterford|belfast)\b/i.test(query)&&!/\bcork\b/i.test(query))return 0;
  const qualifier=query.slice(placeNameQuery(query).length).replace(/^\s*(?:at\s+|,)\s*/i,'');
  const localityWords=placeNameTokens(qualifier);
  const fullAddress=placeWords(`${place.name} ${place.address||''}`).split(' ');
  if(localityWords.some(token=>!fullAddress.some(word=>word.startsWith(token))))return 0;
  const names=[place.name,...(place.aliases||[])];
  return Math.max(...names.map(name=>{
    const words=placeWords(name).split(' ');
    if(!tokens.every(token=>words.some(word=>word.startsWith(token))))return 0;
    const exact=placeWords(placeNameQuery(query))===placeWords(name);
    return (exact?100:70)+tokens.length;
  }));
}
function validCorkPersonalPlace(p){
  return typeof p?.name==='string'&&p.name.trim().length>=2&&p.name.length<=160&&
    typeof p.lat==='number'&&typeof p.lon==='number'&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&isInsideIrelandBounds(p);
}
function personalPlaces(){
  try{const data=JSON.parse(localStorage.getItem(corkPlaceSearch.storageKey)||'[]');return Array.isArray(data)?data.filter(validCorkPersonalPlace).slice(0,100):[];}catch(error){return [];}
}
async function loadCorkPlaceIndex(){
  if(corkPlaceSearch.loaded)return;
  if(corkPlaceSearch.loading)return corkPlaceSearch.loading;
  corkPlaceSearch.loading=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await fetch('data/places/cork-osm.json?v=0.5.3',{signal:controller.signal});
      if(!response.ok)throw Error('Cork index unavailable');
      const data=await response.json();
      corkPlaceSearch.places=(data.places||[]).filter(validCorkPersonalPlace);
      corkPlaceSearch.loaded=true;
    }catch(error){console.warn('Cork places index unavailable; online search and personal pins remain available.');}
    finally{clearTimeout(timer);corkPlaceSearch.loading=null;}
  })();
  return corkPlaceSearch.loading;
}
function localPlaceCandidates(fieldId,query){
  const bias=addressSearchBias(fieldId),seen=new Set();
  const personal=personalPlaces().map(p=>({...p,precision:'user_pin'}));
  const namedByUser=new Set(personal.map(p=>placeWords(p.name)));
  const corrections=corkAddressCorrections.filter(p=>![p.name,...p.aliases].some(name=>namedByUser.has(placeWords(name))));
  const mapped=corkPlaceSearch.places.filter(p=>!namedByUser.has(placeWords(p.name)));
  return [...personal,...corrections,...mapped].map(p=>({p,score:matchingPlaceScore(query,p)})).filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score||(haversineDistanceKm(bias,a.p)-haversineDistanceKm(bias,b.p)))
    .filter(({p})=>{const key=`${placeWords(p.name)}|${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`;if(seen.has(key))return false;seen.add(key);return true;})
    .slice(0,XPLORE_AUTOCOMPLETE_LIMIT).map(({p})=>{
      const note=p.precision==='estate'?p.note:p.precision==='user_pin'?'Your saved pin · confirm this location':p.precision==='mapped_centroid'?'Mapped building/area centre · check the entrance':'OpenStreetMap mapped place · check the entrance';
      const label=p.precision==='estate'?`${p.name} — estate-level location, ${p.address}`:uniqueAddressParts([p.name,p.address]).join(', ');
      return {lat:p.lat,lon:p.lon,name:label,label,display_name:label,primary:p.name,secondary:p.address||'Ireland',type:p.type||'place',
        provider:p.precision==='user_pin'?'Personal saved pin':p.precision==='estate'?'Business address + OSM estate location':'Cork OpenStreetMap index',
        distanceKm:haversineDistanceKm(bias,p),precision:p.precision,_xploreRelaxed:true,_xploreMatchLabel:note,_xploreConfirmationStatus:note};
    });
}
const corkBaseDynamicSuggestions=fetchDynamicAddressSuggestions;
fetchDynamicAddressSuggestions=async function(fieldId,query,signal){
  if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  const available=localPlaceCandidates(fieldId,query);if(available.length)return available;
  await loadCorkPlaceIndex();if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  const local=localPlaceCandidates(fieldId,query);if(local.length)return local;
  const bias=addressSearchBias(fieldId),key=`${fieldId}|${placeWords(query)}|${bias.lat.toFixed(2)}|${bias.lon.toFixed(2)}`;
  const cached=corkPlaceSearch.cache.get(key);
  if(cached&&Date.now()-cached.at<300000)return cached.items;
  let items=[],failure;
  try{items=await corkBaseDynamicSuggestions(fieldId,query,signal);}catch(error){if(error.name==='AbortError')throw error;failure=error;}
  const name=placeNameQuery(query),tokens=placeNameTokens(name);
  const relevant=items.some(item=>tokens.length&&tokens.every(t=>placeWords(item.primary||item.name).includes(t)));
  // Retry a long business+address query as a business name, keeping city context.
  if(name!==normaliseIrishAddressText(query)&&name.length>=3&&!relevant){
    const city=/\bcork\b/i.test(query)?', Cork':'';
    try{const retry=await fetchPhotonSuggestions(fieldId,name+city,signal);if(retry.length)items=retry;}catch(error){if(error.name==='AbortError')throw error;if(!items.length)failure=error;}
  }
  if(!items.length&&failure)throw failure;
  if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  if(corkPlaceSearch.cache.size>=80)corkPlaceSearch.cache.delete(corkPlaceSearch.cache.keys().next().value);
  corkPlaceSearch.cache.set(key,{at:Date.now(),items});return items;
};
function savePersonalPlace(place){
  if(!validCorkPersonalPlace(place))throw Error('Enter a place name and valid Irish pin coordinates.');
  const current=personalPlaces().filter(p=>placeWords(p.name)!==placeWords(place.name));
  localStorage.setItem(corkPlaceSearch.storageKey,JSON.stringify([{...place,precision:'user_pin',savedAt:new Date().toISOString()},...current].slice(0,100)));
  corkPlaceSearch.cache.clear();
}
function initPersonalPlaceUI(){
  const field=$('to')?.closest('.field');if(!field)return;
  const button=document.createElement('button');button.type='button';button.className='missing-place-button';button.textContent='Place missing? Save a pin';field.appendChild(button);
  const dialog=document.createElement('dialog');dialog.className='missing-place-dialog';
  dialog.innerHTML=`<form id="personalPlaceForm"><h2>Save a missing place</h2><p>Choose the entrance on the map or enter its coordinates. Saved places stay in this browser.</p>
    <label>Place name<input id="personalPlaceName" required minlength="2" maxlength="160" autocomplete="off"></label>
    <label>Address (optional)<input id="personalPlaceAddress" maxlength="240" autocomplete="off"></label>
    <label>Latitude, longitude<input id="personalPlaceCoordinates" required placeholder="51.8985, -8.4756" autocomplete="off"></label>
    <button type="button" id="pickPersonalPlace">Choose a pin on the map</button><p id="personalPlaceError" role="status"></p>
    <div class="personal-place-actions"><button type="button" id="cancelPersonalPlace">Cancel</button><button type="submit">Save & use destination</button></div>
    <button type="button" id="removePersonalPlace">Remove saved place with this name</button></form>`;
  document.body.appendChild(dialog);
  const cancelPick=()=>{if(corkPlaceSearch.pickHandler)state.map.off('click',corkPlaceSearch.pickHandler);corkPlaceSearch.pickHandler=null;state.map.getContainer().classList.remove('picking-place');};
  button.onclick=()=>{cancelPick();$('personalPlaceName').value=placeNameQuery($('to').value);$('personalPlaceError').textContent='';dialog.showModal();};
  $('cancelPersonalPlace').onclick=()=>{cancelPick();dialog.close();};
  $('pickPersonalPlace').onclick=()=>{
    if(navigationState.active){$('personalPlaceError').textContent='Stop guidance before choosing a pin on the map.';return;}
    cancelPick();dialog.close();state.map.getContainer().classList.add('picking-place');state.map.getContainer().scrollIntoView({block:'center',behavior:'smooth'});
    setStatus('Tap the place entrance on the map. Use “Place missing?” to cancel or retry.');
    corkPlaceSearch.pickHandler=event=>{const p=event.latlng;cancelPick();$('personalPlaceCoordinates').value=`${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;dialog.showModal();};
    state.map.once('click',corkPlaceSearch.pickHandler);
  };
  $('personalPlaceForm').onsubmit=event=>{
    event.preventDefault();const coords=parseCoordinates($('personalPlaceCoordinates').value);
    try{
      if(!coords)throw Error('Enter latitude, longitude, or choose a pin on the map.');
      const p={name:$('personalPlaceName').value.trim(),address:$('personalPlaceAddress').value.trim(),lat:coords.lat,lon:coords.lon};savePersonalPlace(p);
      resetJourneyPresentation('Personal destination saved. Find routes to the selected pin.');
      confirmAddress('to',p,{status:'Your saved pin · destination confirmed'});dialog.close();
    }catch(error){$('personalPlaceError').textContent=error.message;}
  };
  $('removePersonalPlace').onclick=()=>{
    try{const name=placeWords($('personalPlaceName').value);localStorage.setItem(corkPlaceSearch.storageKey,JSON.stringify(personalPlaces().filter(p=>placeWords(p.name)!==name)));$('personalPlaceError').textContent='Saved place removed from this browser.';}
    catch(error){$('personalPlaceError').textContent='This browser could not remove the saved place.';}
  };
}
loadCorkPlaceIndex();initPersonalPlaceUI();
