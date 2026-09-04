const IRELAND_NETWORK={
  center:{lat:53.38,lon:-8.05},
  bounds:[[51.25,-10.75],[55.45,-5.25]],
  searchViewbox:'-10.75,55.45,-5.25,51.25',
  version:'Ireland v0.3'
};

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

async function irelandGeocodeRequest(query,{fallback=false}={}){
  const q=fallback?`${query}, Ireland`:query;
  const params=new URLSearchParams({
    format:'jsonv2',
    limit:'8',
    countrycodes:'ie,gb',
    addressdetails:'1',
    viewbox:IRELAND_NETWORK.searchViewbox,
    bounded:'1',
    q
  });
  const res=await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`,{headers:{Accept:'application/json'}});
  if(!res.ok)throw new Error('Place search failed');
  return res.json();
}

// Replace the original Cork-biased search with island-wide Ireland search.
geocode=async function(query){
  const coords=parseCoordinates(query);
  if(coords){
    if(!isInsideIrelandBounds(coords))throw new Error('These coordinates are outside the current Ireland pilot coverage.');
    return coords;
  }
  let data=await irelandGeocodeRequest(query);
  let result=data.find(isIrishSearchResult);
  if(!result){
    data=await irelandGeocodeRequest(query,{fallback:true});
    result=data.find(isIrishSearchResult);
  }
  if(!result)throw new Error(`Could not find a location on the island of Ireland for: ${query}`);
  return {lat:+result.lat,lon:+result.lon,name:result.display_name};
};

// Use country-wide language and the nationwide geocoder when a journey is planned.
planJourney=async function(){
  const from=$('from').value.trim(),to=$('to').value.trim();
  if((!from&&!state.liveTracking)||!to){setStatus('Enter both start and destination.',true);return;}
  if(state.liveTracking&&!state.livePosition){setStatus('Waiting for a live GPS fix before routing.',true);return;}
  document.body.classList.add('loading');
  setStatus('Finding locations across Ireland…');
  try{
    const startPromise=state.liveTracking?Promise.resolve({...state.livePosition,name:'Live location'}):geocode(from);
    const [a,b]=await Promise.all([startPromise,geocode(to)]);
    setStatus('Requesting Ireland route options and live context…');
    await routeBetween(a,b);
    if(state.liveTracking)renderLivePosition(state.livePosition);
  }catch(error){
    console.error(error);
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
});
