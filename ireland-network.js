const IRELAND_NETWORK={
  center:{lat:53.38,lon:-8.05},
  bounds:[[51.25,-10.75],[55.45,-5.25]],
  searchViewbox:'-10.75,55.45,-5.25,51.25',
  version:'Ireland v0.3.1'
};

const EIRCODE_PATTERN=/^(?:[AC-FHKNPRTV-Y]\d{2}|D6W)[0-9AC-FHKNPRTV-Y]{4}$/;

function isInsideIrelandBounds(location){
  return location&&location.lat>=51.25&&location.lat<=55.45&&location.lon>=-10.75&&location.lon<=-5.25;
}

function isIrishSearchResult(item){
  const address=item?.address||{};
  const countryCode=(address.country_code||'').toLowerCase();
  const region=[address.state,address.region,address.county,address.country].filter(Boolean).join(' ').toLowerCase();
  const point={lat:+item.lat,lon:+item.lon};
  if(!isInsideIrelandBounds(point))return false;
  if(countryCode==='ie')return true;
  return countryCode==='gb'&&region.includes('northern ireland');
}

function normalizeEircode(value){
  const compact=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!EIRCODE_PATTERN.test(compact))return null;
  return `${compact.slice(0,3)} ${compact.slice(3)}`;
}

function eircodeFromResult(item){
  const postcode=normalizeEircode(item?.address?.postcode||'');
  if(postcode)return postcode;
  const display=String(item?.display_name||'').toUpperCase();
  const match=display.match(/(?:[AC-FHKNPRTV-Y]\d{2}|D6W)\s?[0-9AC-FHKNPRTV-Y]{4}/);
  return match?normalizeEircode(match[0]):null;
}

function exactEircodeResult(item,eircode){
  return isIrishSearchResult(item)&&eircodeFromResult(item)===eircode;
}

async function nominatimSearch(params){
  const base=new URLSearchParams({
    format:'jsonv2',
    limit:'10',
    addressdetails:'1',
    viewbox:IRELAND_NETWORK.searchViewbox,
    bounded:'1',
    ...params
  });
  const res=await fetch(`https://nominatim.openstreetmap.org/search?${base.toString()}`,{headers:{Accept:'application/json'}});
  if(!res.ok)throw new Error('Place search failed');
  return res.json();
}

async function resolveEircode(eircode){
  // Eircodes are exact identifiers. Never accept a fuzzy Irish place result.
  let data=await nominatimSearch({countrycodes:'ie',postalcode:eircode,country:'Ireland'});
  let result=data.find(item=>exactEircodeResult(item,eircode));

  if(!result){
    data=await nominatimSearch({countrycodes:'ie',q:eircode});
    result=data.find(item=>exactEircodeResult(item,eircode));
  }
  if(!result){
    data=await nominatimSearch({countrycodes:'ie',q:`${eircode}, Ireland`});
    result=data.find(item=>exactEircodeResult(item,eircode));
  }

  if(!result){
    throw new Error(`Eircode ${eircode} could not be verified in the current OpenStreetMap geocoder. XPLORE has cleared the old route rather than guessing another location. Please enter the full address or use a dedicated Eircode-capable provider.`);
  }
  return {lat:+result.lat,lon:+result.lon,name:result.display_name,eircode};
}

async function irelandGeocodeRequest(query,{fallback=false}={}){
  const q=fallback?`${query}, Ireland`:query;
  return nominatimSearch({countrycodes:'ie,gb',q});
}

function resetJourneyPresentation(message='Journey changed — find routes again.'){
  if(typeof stopGuidance==='function'&&typeof navigationState!=='undefined'&&navigationState.active){
    stopGuidance();
  }
  if(typeof clearMap==='function')clearMap();
  if(typeof clearContextLayers==='function')clearContextLayers();

  state.routes=[];
  state.enrichedRoutes=[];
  state.activeRoute=0;
  state.lastDestination=null;
  state.lastRoutedLivePosition=null;
  state.lastAutoRerouteAt=0;

  const routeList=$('routeList');
  if(routeList)routeList.innerHTML='<div class="notice">Enter or confirm a destination, then find routes. XPLORE will not keep a previous route after the journey changes.</div>';
  if($('summaryTitle'))$('summaryTitle').textContent='No route selected';
  if($('summaryMeta'))$('summaryMeta').textContent='Choose two Irish locations';
  if($('routeScore'))$('routeScore').textContent='—';
  if($('confidenceValue'))$('confidenceValue').textContent='—';
  if($('co2'))$('co2').textContent='—';
  if($('health'))$('health').textContent='—';
  if($('activeMinutes'))$('activeMinutes').textContent='—';
  if($('reasons'))$('reasons').innerHTML='<span class="reason">Route pending</span>';
  if($('explainList'))$('explainList').innerHTML='<li>Run a new journey to see route explanations.</li>';
  if($('healthWhy'))$('healthWhy').textContent='Run a journey to see how travel mode and active time affect this score.';
  if($('xploreWhy'))$('xploreWhy').textContent='The overall route score combines time, carbon, health/activity, comfort and confidence.';
  if($('scoreBreakdown'))$('scoreBreakdown').innerHTML='';
  if($('startGuidance'))$('startGuidance').disabled=true;
  if($('mapLayerStatus'))$('mapLayerStatus').textContent='Loads around the selected journey';
  ['layerGreenCount','layerCycleCount','layerAccessibilityCount'].forEach(id=>{if($(id))$(id).textContent='—';});
  setStatus(message);
}

// Island-wide address search with strict, fail-safe Eircode handling.
geocode=async function(query){
  const coords=parseCoordinates(query);
  if(coords){
    if(!isInsideIrelandBounds(coords))throw new Error('These coordinates are outside the current Ireland pilot coverage.');
    return coords;
  }

  const eircode=normalizeEircode(query);
  if(eircode)return resolveEircode(eircode);

  let data=await irelandGeocodeRequest(query);
  let result=data.find(isIrishSearchResult);
  if(!result){
    data=await irelandGeocodeRequest(query,{fallback:true});
    result=data.find(isIrishSearchResult);
  }
  if(!result)throw new Error(`Could not find a location on the island of Ireland for: ${query}`);
  return {lat:+result.lat,lon:+result.lon,name:result.display_name};
};

// Use country-wide language and clear any previous route before resolving the new journey.
planJourney=async function(){
  const from=$('from').value.trim(),to=$('to').value.trim();
  if((!from&&!state.liveTracking)||!to){setStatus('Enter both start and destination.',true);return;}
  if(state.liveTracking&&!state.livePosition){setStatus('Waiting for a live GPS fix before routing.',true);return;}

  resetJourneyPresentation('Resolving the new Ireland journey…');
  document.body.classList.add('loading');
  setStatus(normalizeEircode(to)?`Verifying Eircode ${normalizeEircode(to)} exactly…`:'Finding locations across Ireland…');
  try{
    const startPromise=state.liveTracking?Promise.resolve({...state.livePosition,name:'Live location'}):geocode(from);
    const [a,b]=await Promise.all([startPromise,geocode(to)]);
    setStatus(b.eircode?`Eircode ${b.eircode} verified · requesting route options…`:'Requesting Ireland route options and live context…');
    await routeBetween(a,b);
    if(state.liveTracking)renderLivePosition(state.livePosition);
  }catch(error){
    console.error(error);
    // The presentation is already cleared, so a failed lookup cannot leave stale guidance visible.
    setStatus(error.message||'Could not calculate this Ireland journey.',true);
  }finally{
    document.body.classList.remove('loading');
  }
};

function routeDistanceKm(){
  const route=state.enrichedRoutes?.[state.activeRoute]?.raw||state.routes?.[0];
  return (route?.distance||0)/1000;
}

function routeSampleLocations(){
  const route=state.enrichedRoutes?.[state.activeRoute]?.raw||state.routes?.[0];
  const coords=route?.geometry?.coordinates||[];
  if(!coords.length)return [];
  const positions=coords.length<3?[0,coords.length-1]:[0,Math.floor((coords.length-1)/2),coords.length-1];
  return [...new Set(positions)].map(index=>({lat:coords[index][1],lon:coords[index][0]}));
}

function contextBoxAround(location){
  const latRadius=.055;
  const lonRadius=.085;
  return [
    (location.lat-latRadius).toFixed(5),
    (location.lon-lonRadius).toFixed(5),
    (location.lat+latRadius).toFixed(5),
    (location.lon+lonRadius).toFixed(5)
  ].join(',');
}

async function fetchContextBox(bbox){
  const body='data='+encodeURIComponent(buildContextQuery(bbox));
  const response=await fetch(MAP_CONTEXT_ENDPOINT,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
    body
  });
  if(!response.ok)throw new Error('OpenStreetMap context service unavailable');
  return response.json();
}

function mergeOverpassResponses(responses){
  const byKey=new Map();
  responses.forEach(data=>(data?.elements||[]).forEach(element=>byKey.set(`${element.type}:${element.id}`,element)));
  return {elements:[...byKey.values()]};
}

// Long Ireland journeys sample manageable local OSM windows at origin/midpoint/destination.
// Shorter urban journeys keep the richer viewport query already used by XPLORE.
loadContextLayers=async function(){
  const requestId=++contextLayerState.requestId;
  clearContextLayers();
  const longJourney=routeDistanceKm()>30;
  updateLayerStatus(longJourney?'Sampling open-data context along the Ireland route…':'Loading nearby open-data context…');
  try{
    let data;
    if(longJourney){
      const results=[];
      for(const location of routeSampleLocations()){
        try{results.push(await fetchContextBox(contextBoxAround(location)));}
        catch(error){console.warn('One Ireland context sample was unavailable.',error);}
      }
      if(!results.length)throw new Error('Ireland route context unavailable');
      data=mergeOverpassResponses(results);
    }else{
      data=await fetchMapContext();
    }
    if(requestId!==contextLayerState.requestId)return;
    const collection=overpassFeatures(data);
    renderContextLayers(collection);
    updateLayerStatus(longJourney?'Ireland corridor sample · visual context only':'Visual context only · not yet included in scoring');
  }catch(error){
    if(requestId!==contextLayerState.requestId)return;
    console.warn('XPLORE Ireland map context unavailable.',error);
    updateLayerStatus('Ireland context layers temporarily unavailable',true);
  }
};

document.addEventListener('DOMContentLoaded',()=>{
  // App/map initialisation listeners are registered before this module, so the map exists here.
  if(state.map&&!state.routes.length&&!state.livePosition){
    state.map.fitBounds(IRELAND_NETWORK.bounds,{padding:[18,18]});
  }
  const network=document.getElementById('contextNetwork');
  if(network)network.textContent='Ireland-wide';

  // Any manual journey edit invalidates the old route immediately.
  ['from','to'].forEach(id=>{
    const input=$(id);
    if(!input)return;
    input.addEventListener('input',()=>{
      if(state.routes.length||state.enrichedRoutes.length||(typeof navigationState!=='undefined'&&navigationState.active)){
        resetJourneyPresentation('Journey changed — tap Find real routes to calculate the new route.');
      }
    });
  });
});
