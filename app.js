const CORK={lat:51.8985,lon:-8.4756};
const state={map:null,markers:[],layers:[],routes:[],activeRoute:0,mode:'driving',preference:'Balanced',lastContext:null};
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

function setStatus(msg,error=false){const el=$('status');el.textContent=msg;el.style.color=error?'#9b3535':'';}
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
  if(!res.ok) throw new Error('Place search failed');
  const data=await res.json();
  if(!data.length) throw new Error(`Could not find: ${query}`);
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
  if(!res.ok) throw new Error('Routing service unavailable');
  const data=await res.json();
  if(data.code!=='Ok'||!data.routes?.length) throw new Error('No route found for this travel mode');
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

function enrichRoutes(routes){state.routes=routes;return routes.map((r,i)=>({raw:r,providerIndex:i,score:scoreRoute(r,i),confidence:confidence(r,i),carbon:estimateCarbon(r),health:healthScore(r)})).sort((a,b)=>b.score-a.score);}

function drawRoutes(enriched,a,b){
  clearMap();state.markers.push(L.marker([a.lat,a.lon]).addTo(state.map).bindPopup('Start: '+a.name));state.markers.push(L.marker([b.lat,b.lon]).addTo(state.map).bindPopup('Destination: '+b.name));
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

function renderRoutes(enriched){$('routeList').innerHTML=enriched.map((r,i)=>`<div class="route-option ${i===0?'active':''}" data-route="${i}"><div class="route-option-top"><h3>${i===0?'XPLORE Recommended':'Alternative Route'}</h3><span class="mini-score">${r.score}/100</span></div><div class="meta">${formatDuration(r.raw.duration)} · ${formatDistance(r.raw.distance)} · Confidence ${r.confidence}%</div></div>`).join('');document.querySelectorAll('.route-option').forEach(el=>el.onclick=()=>selectRoute(+el.dataset.route,enriched));selectRoute(0,enriched);}

function selectRoute(index,enriched){
  state.activeRoute=index;document.querySelectorAll('.route-option').forEach((el,i)=>el.classList.toggle('active',i===index));state.layers.forEach((l,i)=>l.setStyle({weight:i===index?7:5,opacity:i===index?.9:.30}));
  const r=enriched[index];$('summaryTitle').textContent=index===0?'XPLORE Recommended':'Route Alternative';$('summaryMeta').textContent=`${formatDuration(r.raw.duration)} · ${formatDistance(r.raw.distance)}`;$('routeScore').textContent=r.score;$('confidenceValue').textContent=r.confidence+'%';$('co2').textContent=r.carbon<1?'0 g':Math.round(r.carbon)+' g';$('health').textContent=Math.round(r.health)+'/100';$('activeMinutes').textContent=state.mode==='driving'?'Low':formatDuration(r.raw.duration);
  const reasons=reasonsFor(r,index);$('reasons').innerHTML=reasons.map(x=>`<span class="reason">${x}</span>`).join('');$('explainList').innerHTML=reasons.map(x=>`<li>${x}</li>`).join('');renderScoreRationale(r);
}

function renderContext(ctx){
  if(ctx.weather){const w=ctx.weather;$('contextWeather').textContent=`${Math.round(w.temperature_2m)}°C · ${w.precipitation||0} mm rain · ${Math.round(w.wind_speed_10m)} km/h wind`;}else $('contextWeather').textContent='Unavailable';
  $('contextAQI').textContent=ctx.air?aqiLabel(Math.round(ctx.air.european_aqi)):'Unavailable';$('contextCommunity').textContent='3 prototype signals';$('contextFreshness').textContent='Updated now';
}

async function planJourney(){
  const from=$('from').value.trim(),to=$('to').value.trim();if(!from||!to){setStatus('Enter both start and destination.',true);return;}document.body.classList.add('loading');setStatus('Finding real Cork locations…');
  try{const [a,b]=await Promise.all([geocode(from),geocode(to)]);setStatus('Requesting routes and live context…');const [routes,ctx]=await Promise.all([fetchRoutes(a,b),fetchContext(a,b)]);state.routes=routes;renderContext(ctx);const enriched=enrichRoutes(routes);drawRoutes(enriched,a,b);renderRoutes(enriched);setStatus(`Found ${routes.length} real ${state.mode} route option${routes.length===1?'':'s'}.`);}catch(e){console.error(e);setStatus(e.message||'Could not calculate route.',true);}finally{document.body.classList.remove('loading');}
}

document.addEventListener('DOMContentLoaded',()=>{
  initMap();$('find').onclick=planJourney;
  document.querySelectorAll('.mode').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.mode=btn.dataset.mode;});
  document.querySelectorAll('.choice').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.choice').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.preference=btn.dataset.pref;});
  $('useLocation').onclick=()=>navigator.geolocation?.getCurrentPosition(pos=>{$('from').value=`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;setStatus('Current location captured locally.');},()=>setStatus('Location permission was not granted.',true),{enableHighAccuracy:true,timeout:8000});
});