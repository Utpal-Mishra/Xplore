const CORK={lat:51.8985,lon:-8.4756};
const state={
  map:null,markers:[],layers:[],routes:[],activeRoute:0,mode:'driving',preference:'Balanced',lastContext:null,
  watchId:null,liveTracking:false,livePosition:null,liveMarker:null,accuracyCircle:null,
  lastDestination:null,lastRoutedLivePosition:null,lastAutoRerouteAt:0,routeRefreshBusy:false,enrichedRoutes:[]
};
const $=id=>document.getElementById(id);

function addRasterFallback(){
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    detectRetina:true,
    attribution:'&copy; OpenStreetMap contributors'
  }).addTo(state.map);
}

function initMap(){
  state.map=L.map('map',{zoomControl:true,preferCanvas:true}).setView([CORK.lat,CORK.lon],13);
  if(typeof L.maplibreGL==='function'){
    try{
      L.maplibreGL({style:'https://tiles.openfreemap.org/styles/dark'}).addTo(state.map);
    }catch(error){
      console.warn('Vector basemap unavailable; using raster fallback.',error);
      addRasterFallback();
    }
  }else{
    addRasterFallback();
  }
}

function setStatus(msg,error=false){const el=$('status');el.textContent=msg;el.style.color=error?'#ff8b8b':'';}
function setLocationStatus(msg,active=false,error=false){
  const el=$('locationStatus');if(!el)return;
  el.classList.toggle('active',active);el.classList.toggle('error',error);
  const label=el.querySelector('span:last-child');if(label)label.textContent=msg;
}
function clearMap(){state.layers.forEach(l=>state.map.removeLayer(l));state.layers=[];state.markers.forEach(m=>state.map.removeLayer(m));state.markers=[];}

function parseCoordinates(query){
  const m=query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if(!m)return null;
  const lat=+m[1],lon=+m[2];
  return Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon,name:'Current location'}:null;
}

async function geocode(query){
  const coords=parseCoordinates(query);if(coords)return coords;
  const q=`${query}, Cork, Ireland`;
  const url='https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ie&q='+encodeURIComponent(q);
  const res=await fetch(url,{headers:{Accept:'application/json'}});
  if(!res.ok)throw new Error('Place search failed');
  const data=await res.json();
  if(!data.length)throw new Error(`Could not find: ${query}`);
  return {lat:+data[0].lat,lon:+data[0].lon,name:data[0].display_name};
}

function routingEndpoint(){
  if(state.mode==='cycling')return 'https://routing.openstreetmap.de/routed-bike/route/v1/driving';
  if(state.mode==='walking')return 'https://routing.openstreetmap.de/routed-foot/route/v1/driving';
  return 'https://router.project-osrm.org/route/v1/driving';
}

async function fetchRoutes(a,b){
  const url=`${routingEndpoint()}/${a.lon},${a.lat};${b.lon},${b.lat}?alternatives=3&steps=false&geometries=geojson&overview=full`;
  const res=await fetch(url);
  if(!res.ok)throw new Error('Routing service unavailable');
  const data=await res.json();
  if(data.code!=='Ok'||!data.routes?.length)throw new Error('No route found for this travel mode');
  return data.routes;
}

async function fetchContext(a,b){
  const lat=((a.lat+b.lat)/2).toFixed(5),lon=((a.lon+b.lon)/2).toFixed(5);
  const weatherUrl=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m&timezone=auto`;
  const airUrl=`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5&timezone=auto`;
  const [w,aRes]=await Promise.allSettled([fetch(weatherUrl).then(r=>r.ok?r.json():Promise.reject()),fetch(airUrl).then(r=>r.ok?r.json():Promise.reject())]);
  const weather=w.status==='fulfilled'?w.value.current:null;
  const air=aRes.status==='fulfilled'?aRes.value.current:null;
  const ctx={weather,air,retrievedAt:new Date()};state.lastContext=ctx;return ctx;
}

function estimateCarbon(route){const km=route.distance/1000;if(state.mode==='walking')return 0;if(state.mode==='cycling')return km*4;return km*170;}
function healthScore(route){const mins=route.duration/60;if(state.mode==='walking')return Math.min(100,65+mins*.9);if(state.mode==='cycling')return Math.min(100,68+mins*.8);return 28;}
function contextComfort(){const w=state.lastContext?.weather;if(!w)return 76;let score=88;if((w.precipitation||0)>0.5)score-=18;if((w.wind_speed_10m||0)>30)score-=14;if((w.temperature_2m||15)<3)score-=8;return Math.max(40,score);}
function confidence(route,index){let base=88-index*4;if(!state.lastContext?.weather)base-=4;if(!state.lastContext?.air)base-=3;return Math.max(55,Math.round(base-(route.duration/3600)*2));}

function scoreWeights(){
  if(state.preference==='Greenest')return {time:.20,carbon:.42,health:.18,comfort:.10,confidence:.10};
  if(state.preference==='Healthiest')return {time:.20,carbon:.18,health:.42,comfort:.10,confidence:.10};
  if(state.preference==='Calmest')return {time:.25,carbon:.15,health:.15,comfort:.35,confidence:.10};
  return {time:.38,carbon:.18,health:.16,comfort:.16,confidence:.12};
}

function scoreComponents(route,index){
  const durations=state.routes.map(r=>r.duration),min=Math.min(...durations),max=Math.max(...durations);
  const time=max===min?100:100-((route.duration-min)/(max-min))*28;
  const carbon=estimateCarbon(route),carbonScore=state.mode==='driving'?Math.max(35,100-carbon/15):100;
  return {time,carbon:carbonScore,health:healthScore(route),comfort:Math.max(40,contextComfort()-index*3),confidence:confidence(route,index)};
}

function scoreRoute(route,index){
  const c=scoreComponents(route,index),w=scoreWeights();
  return Math.round(c.time*w.time+c.carbon*w.carbon+c.health*w.health+c.comfort*w.comfort+c.confidence*w.confidence);
}

function enrichRoutes(routes){
  state.routes=routes;
  const enriched=routes.map((r,i)=>({raw:r,providerIndex:i,score:scoreRoute(r,i),confidence:confidence(r,i),carbon:estimateCarbon(r),health:healthScore(r)})).sort((a,b)=>b.score-a.score);
  state.enrichedRoutes=enriched;return enriched;
}

function drawRoutes(enriched,a,b){
  clearMap();
  if(!(state.liveTracking&&a.name==='Live location'))state.markers.push(L.marker([a.lat,a.lon]).addTo(state.map).bindPopup('Start: '+a.name));
  state.markers.push(L.marker([b.lat,b.lon]).addTo(state.map).bindPopup('Destination: '+b.name));
  enriched.forEach((r,i)=>{const layer=L.geoJSON(r.raw.geometry,{style:{weight:i===0?7:5,opacity:i===0?.9:.40}}).addTo(state.map);layer.on('click',()=>selectRoute(i,enriched));state.layers.push(layer);});
  const bounds=L.latLngBounds([[a.lat,a.lon],[b.lat,b.lon]]);enriched.forEach(r=>bounds.extend(L.geoJSON(r.raw.geometry).getBounds()));state.map.fitBounds(bounds.pad(.12));
}

function formatDuration(s){const m=Math.round(s/60);return m<60?`${m} min`:`${Math.floor(m/60)}h ${m%60}m`;}
function formatDistance(m){return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`;}
function aqiLabel(v){if(v==null)return 'Unavailable';if(v<=20)return `${v} · Good`;if(v<=40)return `${v} · Fair`;if(v<=60)return `${v} · Moderate`;if(v<=80)return `${v} · Poor`;if(v<=100)return `${v} · Very poor`;return `${v} · Extremely poor`;}

function reasonsFor(r,rank){
  const items=[];if(rank===0)items.push('Best overall XPLORE score');
  if(r.raw.duration===Math.min(...state.routes.map(x=>x.duration)))items.push('Fastest candidate');
  if(state.mode!=='driving')items.push(r.carbon<5?'Near-zero operational emissions':'Low-carbon mode');
  if(r.health>70)items.push('Strong active-travel benefit');
  const w=state.lastContext?.weather;if(w?.precipitation>0.5)items.push('Rain penalty applied');if(w?.wind_speed_10m>30&&state.mode!=='driving')items.push('High-wind comfort penalty');
  if(r.confidence>=85)items.push('High route confidence');if(state.preference!=='Balanced')items.push(`Optimised for ${state.preference.toLowerCase()}`);return items.slice(0,5);
}

function healthReason(r){
  const mins=Math.round(r.raw.duration/60);
  if(state.mode==='walking')return `Walking for about ${mins} minutes creates a strong active-travel benefit, so the health/activity score rises with useful movement time.`;
  if(state.mode==='cycling')return `Cycling for about ${mins} minutes combines active movement with efficient travel, producing a high health/activity score.`;
  return 'Driving involves little active movement in this pilot model, so its health/activity score stays comparatively low.';
}

function renderScoreRationale(r){
  const c=scoreComponents(r.raw,r.providerIndex),w=scoreWeights();
  $('healthWhy').textContent=healthReason(r);
  $('xploreWhy').textContent=`${state.preference} mode blends five route dimensions. Health/activity is only one part of the final XPLORE score, so the two numbers are intentionally different.`;
  const labels={time:'Time',carbon:'Carbon',health:'Health / activity',comfort:'Comfort',confidence:'Confidence'};
  $('scoreBreakdown').innerHTML=Object.keys(labels).map(k=>`<div class="breakdown-item"><span>${labels[k]}</span><strong>${Math.round(c[k])}/100</strong><small>${Math.round(w[k]*100)}% weight</small></div>`).join('');
}

function renderRoutes(enriched){
  $('routeList').innerHTML=enriched.map((r,i)=>`<div class="route-option ${i===0?'active':''}" data-route="${i}"><div class="route-option-top"><h3>${i===0?'XPLORE Recommended':'Alternative Route'}</h3><span class="mini-score">${r.score}/100</span></div><div class="meta">${formatDuration(r.raw.duration)} · ${formatDistance(r.raw.distance)} · Confidence ${r.confidence}%</div></div>`).join('');
  document.querySelectorAll('.route-option').forEach(el=>el.onclick=()=>selectRoute(+el.dataset.route,enriched));selectRoute(0,enriched);
}

function selectRoute(index,enriched){
  state.activeRoute=index;document.querySelectorAll('.route-option').forEach((el,i)=>el.classList.toggle('active',i===index));state.layers.forEach((l,i)=>l.setStyle({weight:i===index?7:5,opacity:i===index?.9:.30}));
  const r=enriched[index];$('summaryTitle').textContent=index===0?'XPLORE Recommended':'Route Alternative';$('summaryMeta').textContent=`${formatDuration(r.raw.duration)} · ${formatDistance(r.raw.distance)}`;$('routeScore').textContent=r.score;$('confidenceValue').textContent=r.confidence+'%';$('co2').textContent=r.carbon<1?'0 g':Math.round(r.carbon)+' g';$('health').textContent=Math.round(r.health)+'/100';$('activeMinutes').textContent=state.mode==='driving'?'Low':formatDuration(r.raw.duration);
  const reasons=reasonsFor(r,index);$('reasons').innerHTML=reasons.map(x=>`<span class="reason">${x}</span>`).join('');$('explainList').innerHTML=reasons.map(x=>`<li>${x}</li>`).join('');renderScoreRationale(r);
}

function renderContext(ctx){
  if(ctx.weather){const w=ctx.weather;$('contextWeather').textContent=`${Math.round(w.temperature_2m)}°C · ${w.precipitation||0} mm rain · ${Math.round(w.wind_speed_10m)} km/h wind`;}else $('contextWeather').textContent='Unavailable';
  $('contextAQI').textContent=ctx.air?aqiLabel(Math.round(ctx.air.european_aqi)):'Unavailable';$('contextCommunity').textContent='3 prototype signals';$('contextFreshness').textContent='Updated now';
}

function locationFromPosition(position){
  return {lat:position.coords.latitude,lon:position.coords.longitude,name:'Live location',accuracy:position.coords.accuracy||0};
}

function distanceMeters(a,b){
  const R=6371000,toRad=v=>v*Math.PI/180;
  const dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon),lat1=toRad(a.lat),lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

function renderLivePosition(location){
  const latlng=[location.lat,location.lon];
  if(!state.liveMarker){
    state.liveMarker=L.circleMarker(latlng,{radius:8,color:'#07110d',weight:3,fillColor:'#5ee394',fillOpacity:1}).addTo(state.map).bindTooltip('Live location');
  }else state.liveMarker.setLatLng(latlng);
  if(!state.accuracyCircle){
    state.accuracyCircle=L.circle(latlng,{radius:Math.max(location.accuracy,5),color:'#5ee394',weight:1,opacity:.5,fillColor:'#5ee394',fillOpacity:.08,interactive:false}).addTo(state.map);
  }else state.accuracyCircle.setLatLng(latlng).setRadius(Math.max(location.accuracy,5));
  if(state.liveMarker.bringToFront)state.liveMarker.bringToFront();
  const accuracy=Math.round(location.accuracy||0);
  const badge=$('liveMapStatus');if(badge)badge.hidden=false;
  if($('liveMapText'))$('liveMapText').textContent=`Live · ±${accuracy} m`;
  setLocationStatus(`Live · accuracy ±${accuracy} m · auto-reroute after meaningful movement`,true);
}

function removeLiveMapLayers(){
  if(state.liveMarker&&state.map.hasLayer(state.liveMarker))state.map.removeLayer(state.liveMarker);
  if(state.accuracyCircle&&state.map.hasLayer(state.accuracyCircle))state.map.removeLayer(state.accuracyCircle);
  state.liveMarker=null;state.accuracyCircle=null;
  const badge=$('liveMapStatus');if(badge)badge.hidden=true;
}

function geolocationMessage(error){
  if(error?.code===1)return 'Location permission was not granted.';
  if(error?.code===2)return 'Your device could not determine a location.';
  if(error?.code===3)return 'Location request timed out.';
  return 'Live location is unavailable.';
}

function stopLiveTracking(keepLast=true){
  if(state.watchId!=null&&navigator.geolocation)navigator.geolocation.clearWatch(state.watchId);
  state.watchId=null;state.liveTracking=false;state.lastRoutedLivePosition=null;
  const button=$('toggleLive');if(button){button.classList.remove('active');button.setAttribute('aria-pressed','false');button.textContent='Track live location';}
  $('from').readOnly=false;
  if(keepLast&&state.livePosition)$('from').value=`${state.livePosition.lat.toFixed(5)}, ${state.livePosition.lon.toFixed(5)}`;
  removeLiveMapLayers();setLocationStatus('Live location off');
}

async function routeBetween(a,b,{auto=false}={}){
  const [routes,ctx]=await Promise.all([fetchRoutes(a,b),fetchContext(a,b)]);
  state.routes=routes;state.lastDestination=b;renderContext(ctx);
  const enriched=enrichRoutes(routes);drawRoutes(enriched,a,b);renderRoutes(enriched);
  if(state.liveTracking&&state.livePosition){
    state.lastRoutedLivePosition={lat:state.livePosition.lat,lon:state.livePosition.lon};
    state.lastAutoRerouteAt=Date.now();
  }
  setStatus(auto?`Route refreshed from live position · ${routes.length} option${routes.length===1?'':'s'}.`:`Found ${routes.length} real ${state.mode} route option${routes.length===1?'':'s'}.`);
}

async function refreshRouteFromLiveLocation(force=false){
  if(!state.liveTracking||!state.livePosition||!state.lastDestination||state.routeRefreshBusy)return;
  if(!force){
    if(!state.lastRoutedLivePosition)return;
    const moved=distanceMeters(state.lastRoutedLivePosition,state.livePosition);
    if(moved<120||Date.now()-state.lastAutoRerouteAt<60000)return;
  }
  state.routeRefreshBusy=true;
  try{
    setStatus(force?'Updating route from your live position…':'You moved significantly · refreshing route…');
    await routeBetween({...state.livePosition,name:'Live location'},state.lastDestination,{auto:true});
    renderLivePosition(state.livePosition);
  }catch(error){
    console.warn('Live reroute unavailable.',error);setStatus('Live location is updating, but automatic rerouting is temporarily unavailable.',true);
  }finally{state.routeRefreshBusy=false;}
}

function handleLivePosition(position){
  const firstFix=!state.livePosition;
  state.livePosition=locationFromPosition(position);
  $('from').value=`Live location · ${state.livePosition.lat.toFixed(5)}, ${state.livePosition.lon.toFixed(5)}`;
  renderLivePosition(state.livePosition);
  if(firstFix&&!state.routes.length)state.map.setView([state.livePosition.lat,state.livePosition.lon],Math.max(state.map.getZoom(),15));
  if(state.routes.length&&state.lastDestination){
    if(!state.lastRoutedLivePosition)refreshRouteFromLiveLocation(true);
    else refreshRouteFromLiveLocation(false);
  }
}

function startLiveTracking(){
  if(!navigator.geolocation){setLocationStatus('Geolocation is not supported by this browser.',false,true);return;}
  if(state.liveTracking)return;
  state.liveTracking=true;state.livePosition=null;state.lastRoutedLivePosition=null;
  $('from').readOnly=true;
  const button=$('toggleLive');button.classList.add('active');button.setAttribute('aria-pressed','true');button.textContent='Stop live tracking';
  setLocationStatus('Waiting for live GPS fix…',true);setStatus('Requesting live location permission…');
  state.watchId=navigator.geolocation.watchPosition(handleLivePosition,error=>{
    const message=geolocationMessage(error);setLocationStatus(message,false,true);setStatus(message,true);
    if(error?.code===1)stopLiveTracking(false);
  },{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
}

function captureLocationOnce(){
  if(!navigator.geolocation){setStatus('Geolocation is not supported by this browser.',true);return;}
  if(state.liveTracking)stopLiveTracking(false);
  setStatus('Getting your current location…');
  navigator.geolocation.getCurrentPosition(position=>{
    const location=locationFromPosition(position);
    $('from').value=`${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}`;
    const point=L.circleMarker([location.lat,location.lon],{radius:7,color:'#07110d',weight:3,fillColor:'#5ee394',fillOpacity:1}).addTo(state.map).bindTooltip('Current location');
    const accuracy=L.circle([location.lat,location.lon],{radius:Math.max(location.accuracy,5),color:'#5ee394',weight:1,opacity:.4,fillOpacity:.05,interactive:false}).addTo(state.map);
    state.markers.push(point,accuracy);state.map.setView([location.lat,location.lon],Math.max(state.map.getZoom(),15));
    setLocationStatus(`Location captured · accuracy ±${Math.round(location.accuracy)} m`);setStatus('Current location captured locally.');
  },error=>{const message=geolocationMessage(error);setLocationStatus(message,false,true);setStatus(message,true);},{enableHighAccuracy:true,maximumAge:5000,timeout:10000});
}

async function planJourney(){
  const from=$('from').value.trim(),to=$('to').value.trim();
  if((!from&&!state.liveTracking)||!to){setStatus('Enter both start and destination.',true);return;}
  if(state.liveTracking&&!state.livePosition){setStatus('Waiting for a live GPS fix before routing.',true);return;}
  document.body.classList.add('loading');setStatus('Finding real Cork locations…');
  try{
    const startPromise=state.liveTracking?Promise.resolve({...state.livePosition,name:'Live location'}):geocode(from);
    const [a,b]=await Promise.all([startPromise,geocode(to)]);
    setStatus('Requesting routes and live context…');await routeBetween(a,b);
    if(state.liveTracking)renderLivePosition(state.livePosition);
  }catch(error){console.error(error);setStatus(error.message||'Could not calculate route.',true);}finally{document.body.classList.remove('loading');}
}

document.addEventListener('DOMContentLoaded',()=>{
  initMap();$('find').onclick=()=>planJourney();$('useLocation').onclick=captureLocationOnce;$('toggleLive').onclick=()=>state.liveTracking?stopLiveTracking(true):startLiveTracking();
  document.querySelectorAll('.mode').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.mode=btn.dataset.mode;});
  document.querySelectorAll('.choice').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.choice').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.preference=btn.dataset.pref;});
});
