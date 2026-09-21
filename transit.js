// XPLORE Ireland v0.5.0 — scheduled public-transport planner + Irish Rail live context.
// Scheduled data is generated daily from the official NTA GTFS feed by GitHub Actions.
// NTA GTFS-Realtime requires an API key, so bus realtime is intentionally not exposed
// from this static GitHub Pages client. The adapter boundary is documented for a later
// server-side integration. Irish Rail's public realtime endpoint is queried directly
// when the browser permits it; scheduled GTFS remains the fallback.

const XPLORE_TRANSIT_VERSION='0.5.0';
const XPLORE_TRANSIT_DATA_ROOT='data/transit';
const XPLORE_IRISH_RAIL_BASE='https://api.irishrail.ie/realtime/realtime.asmx';

const xploreTransitState={
  loaded:false,
  loading:null,
  manifest:null,
  stops:null,
  trips:null,
  tripsByStop:null,
  itineraries:[],
  active:0,
  originalPlanJourney:null,
  originalGuidanceLabel:null,
  initialised:false
};

function ensureTransitStyles(){
  if(document.querySelector('link[data-xplore-transit]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=`transit.css?v=${XPLORE_TRANSIT_VERSION}`;
  link.dataset.xploreTransit='true';
  document.head.appendChild(link);
}

function transitPanel(){return $('transitPanel');}
function transitStatus(message,tone='normal'){
  const panel=transitPanel();if(!panel)return;
  panel.hidden=false;
  const status=$('transitDataStatus');
  if(status){status.textContent=message;status.dataset.tone=tone;}
}

function transitClock(seconds){
  if(!Number.isFinite(seconds))return '—';
  const value=((Math.round(seconds)%86400)+86400)%86400;
  const h=Math.floor(value/3600),m=Math.floor((value%3600)/60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function transitDuration(seconds){
  const mins=Math.max(0,Math.round(seconds/60));
  return mins<60?`${mins} min`:`${Math.floor(mins/60)}h ${mins%60}m`;
}

function localServiceSeconds(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Dublin',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const get=type=>Number(parts.find(p=>p.type===type)?.value||0);
  return get('hour')*3600+get('minute')*60+get('second');
}

function localServiceDate(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=type=>parts.find(p=>p.type===type)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function transitDistanceMeters(a,b){
  const R=6371000,toRad=v=>v*Math.PI/180;
  const dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon),lat1=toRad(a.lat),lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

function transitWalkSeconds(distanceM){return distanceM/1.32;}

async function loadTransitData(){
  if(xploreTransitState.loaded)return xploreTransitState;
  if(xploreTransitState.loading)return xploreTransitState.loading;
  xploreTransitState.loading=(async()=>{
    transitStatus('Loading today’s NTA schedules…','searching');
    const stamp=encodeURIComponent(localServiceDate());
    const manifest=await fetch(`${XPLORE_TRANSIT_DATA_ROOT}/manifest.json?v=${stamp}`).then(r=>{
      if(!r.ok)throw new Error('Transit schedule manifest is unavailable.');
      return r.json();
    });
    if(!manifest.available)throw new Error(manifest.message||'Transit schedule build is pending.');
    const [stops,trips]=await Promise.all([
      fetch(`${XPLORE_TRANSIT_DATA_ROOT}/stops.json?v=${encodeURIComponent(manifest.generatedAt||stamp)}`).then(r=>r.ok?r.json():Promise.reject(new Error('Transit stops are unavailable.'))),
      fetch(`${XPLORE_TRANSIT_DATA_ROOT}/trips.json?v=${encodeURIComponent(manifest.generatedAt||stamp)}`).then(r=>r.ok?r.json():Promise.reject(new Error('Transit trips are unavailable.')))
    ]);
    xploreTransitState.manifest=manifest;
    xploreTransitState.stops=stops;
    xploreTransitState.trips=trips;
    xploreTransitState.tripsByStop=buildTripsByStop(trips);
    xploreTransitState.loaded=true;
    const stale=manifest.serviceDate!==localServiceDate();
    transitStatus(stale?`Schedules loaded for ${manifest.serviceDate} · refresh build pending`:`NTA schedules loaded · ${manifest.tripCount||trips.length} trips today`,stale?'warning':'success');
    const stampEl=$('transitScheduleStamp');
    if(stampEl)stampEl.textContent=`NTA GTFS · ${manifest.serviceDate}`;
    return xploreTransitState;
  })().catch(error=>{
    xploreTransitState.loading=null;
    transitStatus(error.message||'Transit schedules are unavailable.','error');
    throw error;
  });
  return xploreTransitState.loading;
}

function buildTripsByStop(trips){
  const index=Object.create(null);
  trips.forEach((trip,tripIndex)=>{
    const stops=trip[5]||[];
    stops.forEach((entry,pos)=>{
      const stopId=entry[0],dep=Number(entry[2]??entry[1]);
      if(!index[stopId])index[stopId]=[];
      index[stopId].push([tripIndex,pos,dep]);
    });
  });
  Object.values(index).forEach(list=>list.sort((a,b)=>a[2]-b[2]));
  return index;
}

function stopRecord(stopId){
  const row=xploreTransitState.stops?.[stopId];
  if(!row)return null;
  return {id:stopId,name:row[0],lat:+row[1],lon:+row[2],parent:row[3]||null};
}

function nearestTransitStops(point,limit=8,maxKm=4){
  const rows=[];
  for(const [id,row] of Object.entries(xploreTransitState.stops||{})){
    const stop={id,name:row[0],lat:+row[1],lon:+row[2],parent:row[3]||null};
    const distance=transitDistanceMeters(point,stop);
    if(distance<=maxKm*1000)rows.push({...stop,distance,walkSec:transitWalkSeconds(distance)});
  }
  rows.sort((a,b)=>a.distance-b.distance);
  return rows.slice(0,limit);
}

function lowerBoundDeparture(refs,time){
  let lo=0,hi=refs.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(refs[mid][2]<time)lo=mid+1;else hi=mid;}
  return lo;
}

function tripObject(index){
  const row=xploreTransitState.trips[index];
  if(!row)return null;
  return {index,id:row[0],routeShort:row[1]||'',routeLong:row[2]||'',mode:row[3]||'transit',headsign:row[4]||'',stops:row[5]||[]};
}

function stopPositionAfter(trip,startPos,destinationSet){
  for(let i=startPos+1;i<trip.stops.length;i++)if(destinationSet.has(trip.stops[i][0]))return i;
  return -1;
}

function buildTransitLeg(trip,fromPos,toPos){
  const from=trip.stops[fromPos],to=trip.stops[toPos];
  return {
    tripIndex:trip.index,tripId:trip.id,routeShort:trip.routeShort,routeLong:trip.routeLong,mode:trip.mode,headsign:trip.headsign,
    fromPos,toPos,boardStopId:from[0],alightStopId:to[0],departure:+(from[2]??from[1]),arrival:+(to[1]??to[2])
  };
}

function directTransitItineraries(originStops,destinationStops,nowSec){
  const destinationMap=new Map(destinationStops.map(stop=>[stop.id,stop]));
  const destinationSet=new Set(destinationMap.keys());
  const out=[];
  for(const origin of originStops){
    const refs=xploreTransitState.tripsByStop[origin.id]||[];
    const earliest=nowSec+origin.walkSec;
    let cursor=lowerBoundDeparture(refs,earliest);
    for(let inspected=0;cursor<refs.length&&inspected<70;cursor++,inspected++){
      const [tripIndex,pos]=refs[cursor],trip=tripObject(tripIndex);if(!trip)continue;
      const toPos=stopPositionAfter(trip,pos,destinationSet);if(toPos<0)continue;
      const leg=buildTransitLeg(trip,pos,toPos),destination=destinationMap.get(leg.alightStopId);
      if(leg.arrival<leg.departure)continue;
      out.push(makeItinerary(origin,destination,[leg],nowSec));
    }
  }
  return out;
}

function oneTransferItineraries(originStops,destinationStops,nowSec){
  const destinationMap=new Map(destinationStops.map(stop=>[stop.id,stop]));
  const destinationSet=new Set(destinationMap.keys());
  const out=[];
  const firstBoardings=[];
  for(const origin of originStops){
    const refs=xploreTransitState.tripsByStop[origin.id]||[];
    const earliest=nowSec+origin.walkSec;
    let cursor=lowerBoundDeparture(refs,earliest);
    for(let i=0;cursor<refs.length&&i<24;cursor++,i++)firstBoardings.push({origin,ref:refs[cursor]});
  }
  firstBoardings.sort((a,b)=>a.ref[2]-b.ref[2]);

  for(const boarding of firstBoardings.slice(0,70)){
    const [firstTripIndex,firstPos]=boarding.ref,firstTrip=tripObject(firstTripIndex);if(!firstTrip)continue;
    const downstreamLimit=Math.min(firstTrip.stops.length,firstPos+34);
    for(let transferPos=firstPos+1;transferPos<downstreamLimit;transferPos++){
      const transferEntry=firstTrip.stops[transferPos],transferStopId=transferEntry[0],arrival=+(transferEntry[1]??transferEntry[2]);
      const secondRefs=xploreTransitState.tripsByStop[transferStopId]||[];
      let cursor=lowerBoundDeparture(secondRefs,arrival+120);
      for(let inspected=0;cursor<secondRefs.length&&inspected<14;cursor++,inspected++){
        const [secondTripIndex,secondPos,dep]=secondRefs[cursor];
        if(dep>arrival+5400)break;
        if(secondTripIndex===firstTripIndex)continue;
        const secondTrip=tripObject(secondTripIndex);if(!secondTrip)continue;
        const destinationPos=stopPositionAfter(secondTrip,secondPos,destinationSet);if(destinationPos<0)continue;
        const firstLeg=buildTransitLeg(firstTrip,firstPos,transferPos),secondLeg=buildTransitLeg(secondTrip,secondPos,destinationPos);
        if(secondLeg.departure<firstLeg.arrival+120)continue;
        const destination=destinationMap.get(secondLeg.alightStopId);
        out.push(makeItinerary(boarding.origin,destination,[firstLeg,secondLeg],nowSec));
      }
    }
  }
  return out;
}

function makeItinerary(origin,destination,legs,nowSec){
  const first=legs[0],last=legs[legs.length-1];
  const totalEnd=last.arrival+destination.walkSec;
  const duration=Math.max(0,totalEnd-nowSec);
  return {
    origin,destination,legs,departure:first.departure,arrival:last.arrival,totalEnd,duration,
    accessWalkSec:origin.walkSec,egressWalkSec:destination.walkSec,
    walkingSec:origin.walkSec+destination.walkSec,
    transfers:Math.max(0,legs.length-1)
  };
}

function itineraryKey(item){return `${item.legs.map(l=>l.tripId).join('>')}|${item.origin.id}|${item.destination.id}`;}

function dedupeAndRankItineraries(items){
  const unique=new Map();
  items.sort((a,b)=>a.totalEnd-b.totalEnd||a.transfers-b.transfers);
  for(const item of items){const key=itineraryKey(item);if(!unique.has(key))unique.set(key,item);}
  const ranked=[...unique.values()].slice(0,6);
  if(!ranked.length)return ranked;
  const min=Math.min(...ranked.map(x=>x.duration)),max=Math.max(...ranked.map(x=>x.duration));
  ranked.forEach((item,index)=>{
    const time=max===min?100:100-((item.duration-min)/(max-min))*26;
    const walkingMinutes=item.walkingSec/60;
    const health=Math.min(100,52+walkingMinutes*1.35);
    const reliability=Math.max(58,90-item.transfers*11-index*2);
    const carbon=estimateTransitCarbon(item);
    const carbonScore=Math.max(45,100-carbon/20);
    const comfort=Math.max(55,86-item.transfers*7);
    const weights=state.preference==='Greenest'?{time:.22,carbon:.36,health:.17,comfort:.12,reliability:.13}:
      state.preference==='Healthiest'?{time:.22,carbon:.18,health:.34,comfort:.12,reliability:.14}:
      state.preference==='Calmest'?{time:.24,carbon:.17,health:.12,comfort:.30,reliability:.17}:
      {time:.34,carbon:.21,health:.14,comfort:.14,reliability:.17};
    item.components={time,carbon:carbonScore,health,comfort,reliability};
    item.carbon=carbon;item.health=health;item.reliability=reliability;
    item.score=Math.round(time*weights.time+carbonScore*weights.carbon+health*weights.health+comfort*weights.comfort+reliability*weights.reliability);
    item.weights=weights;
  });
  return ranked.sort((a,b)=>b.score-a.score||a.totalEnd-b.totalEnd);
}

function estimateTransitCarbon(item){
  const factors={rail:35,tram:30,bus:80,ferry:150,subway:35,transit:65};
  let grams=0;
  for(const leg of item.legs){
    const trip=tripObject(leg.tripIndex);if(!trip)continue;
    let km=0;
    for(let i=leg.fromPos;i<leg.toPos;i++){
      const a=stopRecord(trip.stops[i][0]),b=stopRecord(trip.stops[i+1][0]);
      if(a&&b)km+=transitDistanceMeters(a,b)/1000;
    }
    grams+=km*(factors[leg.mode]||factors.transit);
  }
  return Math.round(grams);
}

function legLabel(leg){
  const route=leg.routeShort||leg.routeLong||leg.headsign||'Transit';
  const mode=leg.mode==='rail'?'Train':leg.mode==='tram'?'Tram':leg.mode==='bus'?'Bus':leg.mode==='ferry'?'Ferry':'Transit';
  return `${mode} ${route}`.trim();
}

function transitReasons(item,index){
  const reasons=[];
  if(index===0)reasons.push('Best overall transit XPLORE score');
  if(item.transfers===0)reasons.push('Direct public-transport journey');
  else reasons.push(`${item.transfers} transfer${item.transfers===1?'':'s'}`);
  const walk=Math.round(item.walkingSec/60);if(walk<=12)reasons.push(`${walk} min estimated walking`);
  if(item.carbon<1500)reasons.push('Lower-carbon shared transport');
  if(item.reliability>=82)reasons.push('Strong scheduled-journey confidence');
  return reasons.slice(0,5);
}

function renderTransitItineraries(items){
  xploreTransitState.itineraries=items;xploreTransitState.active=0;
  if(!items.length){
    $('routeList').innerHTML='<div class="notice">No same-day direct or one-transfer public-transport itinerary was found from nearby stops. Try a nearby station/stop or another travel mode.</div>';
    return;
  }
  $('routeList').innerHTML=items.map((item,index)=>{
    const legs=item.legs.map(leg=>`<span>${escapeAddressHtml(legLabel(leg))}</span>`).join('');
    return `<button type="button" class="route-option transit-route-option ${index===0?'active':''}" data-transit-route="${index}">
      <div class="route-option-top"><h3>${index===0?'XPLORE Transit Recommended':'Transit Alternative'}</h3><span class="mini-score">${item.score}/100</span></div>
      <div class="meta">${transitDuration(item.duration)} · ${transitClock(item.departure)} → ${transitClock(item.arrival)} · ${item.transfers} transfer${item.transfers===1?'':'s'}</div>
      <div class="transit-leg-chips">${legs}</div>
    </button>`;
  }).join('');
  document.querySelectorAll('[data-transit-route]').forEach(el=>el.addEventListener('click',()=>selectTransitItinerary(+el.dataset.transitRoute)));
  selectTransitItinerary(0);
}

function drawTransitItinerary(item,start,destination){
  clearMap();
  state.markers.push(L.marker([start.lat,start.lon]).addTo(state.map).bindPopup('Start: '+start.name));
  state.markers.push(L.marker([destination.lat,destination.lon]).addTo(state.map).bindPopup('Destination: '+destination.name));
  const bounds=L.latLngBounds([[start.lat,start.lon],[destination.lat,destination.lon]]);

  const firstStop=stopRecord(item.legs[0].boardStopId),lastStop=stopRecord(item.legs[item.legs.length-1].alightStopId);
  if(firstStop){
    const access=L.polyline([[start.lat,start.lon],[firstStop.lat,firstStop.lon]],{weight:3,opacity:.75,dashArray:'7 8'}).addTo(state.map);state.layers.push(access);bounds.extend([firstStop.lat,firstStop.lon]);
  }
  item.legs.forEach((leg,legIndex)=>{
    const trip=tripObject(leg.tripIndex);if(!trip)return;
    const coords=[];
    for(let i=leg.fromPos;i<=leg.toPos;i++){
      const stop=stopRecord(trip.stops[i][0]);if(stop){coords.push([stop.lat,stop.lon]);bounds.extend([stop.lat,stop.lon]);}
    }
    if(coords.length>1){const line=L.polyline(coords,{weight:legIndex===0?7:6,opacity:.92}).addTo(state.map);state.layers.push(line);}
    const board=stopRecord(leg.boardStopId),alight=stopRecord(leg.alightStopId);
    if(board)state.markers.push(L.circleMarker([board.lat,board.lon],{radius:6,weight:2,fillOpacity:1}).addTo(state.map).bindTooltip(`${legLabel(leg)} · board ${board.name}`));
    if(alight)state.markers.push(L.circleMarker([alight.lat,alight.lon],{radius:5,weight:2,fillOpacity:1}).addTo(state.map).bindTooltip(`Alight · ${alight.name}`));
  });
  if(lastStop){const egress=L.polyline([[lastStop.lat,lastStop.lon],[destination.lat,destination.lon]],{weight:3,opacity:.75,dashArray:'7 8'}).addTo(state.map);state.layers.push(egress);}
  state.map.fitBounds(bounds.pad(.15));
}

function renderTransitScore(item,index){
  const walkMinutes=Math.round(item.walkingSec/60),reasons=transitReasons(item,index);
  $('summaryTitle').textContent=index===0?'XPLORE Transit Recommended':'Transit Alternative';
  $('summaryMeta').textContent=`${transitDuration(item.duration)} · ${transitClock(item.departure)} → ${transitClock(item.arrival)}`;
  $('routeScore').textContent=item.score;
  $('confidenceValue').textContent=`${Math.round(item.reliability)}%`;
  $('co2').textContent=item.carbon<1000?`${item.carbon} g`:`${(item.carbon/1000).toFixed(1)} kg`;
  $('health').textContent=`${Math.round(item.health)}/100`;
  $('activeMinutes').textContent=`${walkMinutes} min walk`;
  $('reasons').innerHTML=reasons.map(x=>`<span class="reason">${x}</span>`).join('');
  $('explainList').innerHTML=reasons.map(x=>`<li>${x}</li>`).join('');
  $('healthWhy').textContent=`About ${walkMinutes} minutes of estimated access/egress walking contributes to the transit health/activity score.`;
  $('xploreWhy').textContent='Transit scoring combines door-to-door time, indicative carbon, active walking, transfer comfort and scheduled-journey reliability. Realtime bus reliability is not yet included.';
  const labels={time:'Door-to-door time',carbon:'Indicative carbon',health:'Health / activity',comfort:'Transfer comfort',reliability:'Schedule confidence'};
  $('scoreBreakdown').innerHTML=Object.entries(labels).map(([key,label])=>`<div class="breakdown-item"><span>${label}</span><strong>${Math.round(item.components[key])}/100</strong><small>${Math.round(item.weights[key]*100)}% weight</small></div>`).join('');
  const guidance=$('startGuidance');if(guidance){xploreTransitState.originalGuidanceLabel=xploreTransitState.originalGuidanceLabel||guidance.textContent;guidance.disabled=true;guidance.textContent='Transit guidance next';guidance.title='Transit v1 plans the itinerary; stop-by-stop transit guidance is the next iteration.';}
}

async function selectTransitItinerary(index){
  const item=xploreTransitState.itineraries[index];if(!item)return;
  xploreTransitState.active=index;
  document.querySelectorAll('[data-transit-route]').forEach((el,i)=>el.classList.toggle('active',i===index));
  renderTransitScore(item,index);
  if(xploreTransitState.lastStart&&xploreTransitState.lastDestination)drawTransitItinerary(item,xploreTransitState.lastStart,xploreTransitState.lastDestination);
  await enrichIrishRailRealtime(item);
}

function xmlText(node,name){return node?.getElementsByTagName(name)?.[0]?.textContent?.trim()||'';}
function normaliseRailStationName(name){
  return String(name||'').replace(/\b(railway|train)\s+station\b/ig,'').replace(/\bstation\b/ig,'').replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim();
}

async function enrichIrishRailRealtime(item){
  const railLeg=item?.legs?.find(leg=>leg.mode==='rail');
  const liveEl=$('transitRailLive');if(!liveEl)return;
  if(!railLeg){liveEl.textContent='No rail leg in selected itinerary';liveEl.dataset.tone='normal';return;}
  const board=stopRecord(railLeg.boardStopId),query=normaliseRailStationName(board?.name);
  if(!query){liveEl.textContent='Rail schedule available · live station match unavailable';liveEl.dataset.tone='warning';return;}
  liveEl.textContent=`Checking Irish Rail live departures at ${query}…`;liveEl.dataset.tone='searching';
  try{
    const url=`${XPLORE_IRISH_RAIL_BASE}/getStationDataByNameXML_withNumMins?StationDesc=${encodeURIComponent(query)}&NumMins=120`;
    const response=await fetch(url,{headers:{Accept:'application/xml,text/xml'}});if(!response.ok)throw new Error('Rail realtime unavailable');
    const text=await response.text(),xml=new DOMParser().parseFromString(text,'text/xml');
    const rows=[...xml.getElementsByTagName('objStationData')];
    if(!rows.length){liveEl.textContent='Irish Rail live feed returned no matching departure · using schedule';liveEl.dataset.tone='warning';return;}
    const desired=railLeg.headsign.toLowerCase();
    const ranked=rows.map(row=>({row,dest:xmlText(row,'Destination'),due:Number(xmlText(row,'Duein')),late:Number(xmlText(row,'Late')),code:xmlText(row,'Traincode'),exp:xmlText(row,'Expdepart'),sch:xmlText(row,'Schdepart')}))
      .filter(x=>Number.isFinite(x.due)&&x.due>=0)
      .sort((a,b)=>{
        const am=desired&&a.dest.toLowerCase().includes(desired)?-1:0,bm=desired&&b.dest.toLowerCase().includes(desired)?-1:0;
        return am-bm||a.due-b.due;
      });
    const next=ranked[0];
    if(!next){liveEl.textContent='Irish Rail live feed available · no upcoming matching train';liveEl.dataset.tone='warning';return;}
    liveEl.textContent=`Live rail · ${next.code||'train'} to ${next.dest||railLeg.headsign||'destination'} · due ${next.due} min${next.late>0?` · ${next.late} min late`:''}`;
    liveEl.dataset.tone=next.late>5?'warning':'success';
  }catch(error){
    liveEl.textContent='Irish Rail realtime unavailable in this browser · scheduled GTFS retained';liveEl.dataset.tone='warning';
  }
}

async function planTransitJourney(start,destination){
  document.body.classList.add('loading');
  try{
    await loadTransitData();
    const manifest=xploreTransitState.manifest;
    if(manifest.serviceDate!==localServiceDate())transitStatus(`Schedule date ${manifest.serviceDate} differs from today · results are indicative`,'warning');
    setStatus('Finding nearby bus/train stops and today’s scheduled connections…');
    const originStops=nearestTransitStops(start,10,4.5),destinationStops=nearestTransitStops(destination,10,4.5);
    if(!originStops.length||!destinationStops.length)throw new Error('No mapped NTA transit stops were found close enough to one of these locations.');
    const nowSec=localServiceSeconds();
    const candidates=[...directTransitItineraries(originStops,destinationStops,nowSec),...oneTransferItineraries(originStops,destinationStops,nowSec)];
    const itineraries=dedupeAndRankItineraries(candidates);
    xploreTransitState.lastStart=start;xploreTransitState.lastDestination=destination;
    state.lastDestination=destination;state.routes=[];state.enrichedRoutes=[];
    const ctx=await fetchContext(start,destination).catch(()=>({weather:null,air:null,retrievedAt:new Date()}));renderContext(ctx);
    renderTransitItineraries(itineraries);
    const busRealtime=$('transitBusLive');if(busRealtime)busRealtime.textContent='Bus · NTA scheduled GTFS active · GTFS-Realtime requires server-side API key';
    if(!itineraries.length){setStatus('No same-day direct or one-transfer transit itinerary found.',true);return;}
    setStatus(`Found ${itineraries.length} scheduled public-transport option${itineraries.length===1?'':'s'} using today’s NTA GTFS.`);
  }finally{document.body.classList.remove('loading');}
}

function restoreRoadGuidanceControl(){
  const guidance=$('startGuidance');if(guidance&&xploreTransitState.originalGuidanceLabel){guidance.textContent=xploreTransitState.originalGuidanceLabel;guidance.title='';}
}

function initTransitV1(){
  if(xploreTransitState.initialised)return;xploreTransitState.initialised=true;
  ensureTransitStyles();
  xploreTransitState.originalPlanJourney=planJourney;
  planJourney=async function(){
    if(state.mode!=='transit')return xploreTransitState.originalPlanJourney();
    const fromText=$('from').value.trim(),toText=$('to').value.trim();
    if((!fromText&&!state.liveTracking)||!toText){setStatus('Enter both start and destination.',true);return;}
    let start=state.liveTracking?state.livePosition:await confirmedLocationForRoute('from');
    if(!start){setStatus('Choose a Start suggestion before finding transit.',true);return;}
    const destination=await confirmedLocationForRoute('to');
    if(!destination){setStatus('Choose a Destination suggestion before finding transit.',true);return;}
    await planTransitJourney({...start,name:start.name||'Start'},destination);
  };

  document.querySelectorAll('.mode').forEach(button=>button.addEventListener('click',()=>{
    const transit=button.dataset.mode==='transit';
    if(transit){
      transitPanel().hidden=false;
      setStatus('Transit mode selected · choose confirmed start and destination locations.');
      if($('startGuidance'))$('startGuidance').disabled=true;
    }else{
      if(transitPanel())transitPanel().hidden=true;
      restoreRoadGuidanceControl();
    }
  }));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initTransitV1,{once:true});
else initTransitV1();
