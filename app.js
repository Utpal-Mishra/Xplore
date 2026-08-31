const CORK={lat:51.8985,lon:-8.4756};
const state={map:null,markers:[],layers:[],routes:[],activeRoute:0,mode:'driving',preference:'Balanced'};
const $=id=>document.getElementById(id);

function initMap(){
  state.map=L.map('map',{zoomControl:true}).setView([CORK.lat,CORK.lon],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);
}

function setStatus(msg,error=false){const el=$('status');el.textContent=msg;el.style.color=error?'#9b3535':'';}
function clearMap(){state.layers.forEach(l=>state.map.removeLayer(l));state.layers=[];state.markers.forEach(m=>state.map.removeLayer(m));state.markers=[];}

async function geocode(query){
  const q=`${query}, Cork, Ireland`;
  const url='https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ie&q='+encodeURIComponent(q);
  const res=await fetch(url,{headers:{'Accept':'application/json'}});
  if(!res.ok) throw new Error('Place search failed');
  const data=await res.json();
  if(!data.length) throw new Error(`Could not find: ${query}`);
  return {lat:+data[0].lat,lon:+data[0].lon,name:data[0].display_name};
}

async function fetchRoutes(a,b){
  const profile=state.mode==='cycling'?'cycling':state.mode==='walking'?'walking':'driving';
  const url=`https://router.project-osrm.org/route/v1/${profile}/${a.lon},${a.lat};${b.lon},${b.lat}?alternatives=3&steps=false&geometries=geojson&overview=full`;
  const res=await fetch(url);
  if(!res.ok) throw new Error('Routing service unavailable');
  const data=await res.json();
  if(data.code!=='Ok'||!data.routes?.length) throw new Error('No route found');
  return data.routes;
}

function estimateCarbon(route){
  const km=route.distance/1000;
  if(state.mode==='walking') return 0;
  if(state.mode==='cycling') return km*4;
  return km*170;
}

function healthScore(route){
  const mins=route.duration/60;
  if(state.mode==='walking') return Math.min(100,65+mins*.9);
  if(state.mode==='cycling') return Math.min(100,68+mins*.8);
  return 28;
}

function confidence(route,index){
  const base=88-index*4;
  return Math.max(60,Math.round(base-(route.duration/3600)*2));
}

function scoreRoute(route,index){
  const durations=state.routes.map(r=>r.duration);
  const min=Math.min(...durations),max=Math.max(...durations);
  const timeScore=max===min?100:100-((route.duration-min)/(max-min))*28;
  const carbon=estimateCarbon(route);
  const carbonScore=state.mode==='driving'?Math.max(35,100-carbon/15):100;
  const health=healthScore(route);
  const altBonus=index===0?0:Math.min(8,index*3);
  let weights={time:.38,carbon:.18,health:.16,comfort:.16,confidence:.12};
  if(state.preference==='Greenest')weights={time:.20,carbon:.42,health:.18,comfort:.10,confidence:.10};
  if(state.preference==='Healthiest')weights={time:.20,carbon:.18,health:.42,comfort:.10,confidence:.10};
  if(state.preference==='Calmest')weights={time:.25,carbon:.15,health:.15,comfort:.35,confidence:.10};
  const comfort=Math.max(55,82-altBonus);
  const conf=confidence(route,index);
  return Math.round(timeScore*weights.time+carbonScore*weights.carbon+health*weights.health+comfort*weights.comfort+conf*weights.confidence);
}

function enrichRoutes(routes){
  state.routes=routes;
  return routes.map((r,i)=>({raw:r,index:i,score:scoreRoute(r,i),confidence:confidence(r,i),carbon:estimateCarbon(r),health:healthScore(r)})).sort((a,b)=>b.score-a.score);
}

function drawRoutes(enriched,a,b){
  clearMap();
  state.markers.push(L.marker([a.lat,a.lon]).addTo(state.map).bindPopup('Start: '+a.name));
  state.markers.push(L.marker([b.lat,b.lon]).addTo(state.map).bindPopup('Destination: '+b.name));
  enriched.forEach((r,i)=>{
    const layer=L.geoJSON(r.raw.geometry,{style:{weight:i===0?7:5,opacity:i===0?.9:.45}}).addTo(state.map);
    layer.on('click',()=>selectRoute(i,enriched));
    state.layers.push(layer);
  });
  const bounds=L.latLngBounds([[a.lat,a.lon],[b.lat,b.lon]]);enriched.forEach(r=>bounds.extend(L.geoJSON(r.raw.geometry).getBounds()));state.map.fitBounds(bounds.pad(.12));
}

function formatDuration(s){const m=Math.round(s/60);return m<60?`${m} min`:`${Math.floor(m/60)}h ${m%60}m`;}
function formatDistance(m){return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`;}

function reasonsFor(r,rank){
  const items=[];
  if(rank===0)items.push('Best overall XPLORE score');
  if(r.raw.duration===Math.min(...state.routes.map(x=>x.duration)))items.push('Fastest candidate');
  if(state.mode!=='driving')items.push(r.carbon<5?'Near-zero operational emissions':'Low-carbon mode');
  if(r.health>70)items.push('Strong active-travel benefit');
  if(r.confidence>=85)items.push('High route confidence');
  if(state.preference!=='Balanced')items.push(`Optimised for ${state.preference.toLowerCase()}`);
  return items.slice(0,4);
}

function renderRoutes(enriched){
  $('routeList').innerHTML=enriched.map((r,i)=>`<div class="route-option ${i===0?'active':''}" data-route="${i}"><div class="route-option-top"><h3>${i===0?'XPLORE Recommended':'Alternative '+(i+1)}</h3><span class="mini-score">${r.score}/100</span></div><div class="meta">${formatDuration(r.raw.duration)} · ${formatDistance(r.raw.distance)} · Confidence ${r.confidence}%</div></div>`).join('');
  document.querySelectorAll('.route-option').forEach(el=>el.onclick=()=>selectRoute(+el.dataset.route,enriched));
  selectRoute(0,enriched);
}

function selectRoute(index,enriched){
  state.activeRoute=index;
  document.querySelectorAll('.route-option').forEach((el,i)=>el.classList.toggle('active',i===index));
  state.layers.forEach((l,i)=>l.setStyle({weight:i===index?7:5,opacity:i===index?.9:.35}));
  const r=enriched[index];
  $('summaryTitle').textContent=index===0?'XPLORE Recommended':'Route Alternative';
  $('summaryMeta').textContent=`${formatDuration(r.raw.duration)} · ${formatDistance(r.raw.distance)}`;
  $('routeScore').textContent=r.score;
  $('confidenceValue').textContent=r.confidence+'%';
  $('co2').textContent=r.carbon<1?'0 g':Math.round(r.carbon)+' g';
  $('health').textContent=Math.round(r.health)+'/100';
  $('activeMinutes').textContent=state.mode==='driving'?'Low':formatDuration(r.raw.duration);
  const reasons=reasonsFor(r,index);
  $('reasons').innerHTML=reasons.map(x=>`<span class="reason">${x}</span>`).join('');
  $('explainList').innerHTML=reasons.map(x=>`<li>${x}</li>`).join('');
}

async function planJourney(){
  const from=$('from').value.trim(),to=$('to').value.trim();
  if(!from||!to){setStatus('Enter both start and destination.',true);return;}
  document.body.classList.add('loading');setStatus('Finding real Cork locations and route alternatives…');
  try{
    const [a,b]=await Promise.all([geocode(from),geocode(to)]);
    setStatus('Locations found. Requesting route alternatives…');
    const routes=await fetchRoutes(a,b);
    state.routes=routes;
    const enriched=enrichRoutes(routes);
    drawRoutes(enriched,a,b);renderRoutes(enriched);
    $('contextWeather').textContent='Context adapter ready';
    $('contextAQI').textContent='Context adapter ready';
    $('contextCommunity').textContent='3 prototype signals';
    $('contextFreshness').textContent='Live route data';
    setStatus(`Found ${routes.length} real route option${routes.length===1?'':'s'}.`);
  }catch(e){console.error(e);setStatus(e.message||'Could not calculate route.',true);}
  finally{document.body.classList.remove('loading');}
}

document.addEventListener('DOMContentLoaded',()=>{
  initMap();
  $('find').onclick=planJourney;
  document.querySelectorAll('.mode').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.mode=btn.dataset.mode;});
  document.querySelectorAll('.choice').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.choice').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.preference=btn.dataset.pref;});
  $('useLocation').onclick=()=>navigator.geolocation?.getCurrentPosition(pos=>{ $('from').value=`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;setStatus('Current location captured locally. Coordinate search support is next.');},()=>setStatus('Location permission was not granted.',true));
});