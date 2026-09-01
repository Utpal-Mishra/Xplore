const navigationState={
  active:false,
  voice:false,
  headingMarker:null,
  previousLocation:null,
  lastInstructionKey:null,
  lastOffRouteRerouteAt:0,
  permissionState:'unknown'
};

// Request OSRM manoeuvre steps so XPLORE can provide journey-following guidance.
fetchRoutes=async function(a,b){
  const url=`${routingEndpoint()}/${a.lon},${a.lat};${b.lon},${b.lat}?alternatives=3&steps=true&geometries=geojson&overview=full`;
  const res=await fetch(url);
  if(!res.ok)throw new Error('Routing service unavailable');
  const data=await res.json();
  if(data.code!=='Ok'||!data.routes?.length)throw new Error('No route found for this travel mode');
  return data.routes;
};

// Preserve heading/speed when available from the device GPS.
locationFromPosition=function(position){
  return {
    lat:position.coords.latitude,
    lon:position.coords.longitude,
    name:'Live location',
    accuracy:position.coords.accuracy||0,
    heading:Number.isFinite(position.coords.heading)?position.coords.heading:null,
    speed:Number.isFinite(position.coords.speed)?position.coords.speed:null,
    timestamp:position.timestamp||Date.now()
  };
};

function permissionHelp(message,show=true){
  const el=$('locationPermissionHelp');
  if(!el)return;
  el.hidden=!show;
  if(message)el.textContent=message;
}

async function geolocationPermissionState(){
  if(!navigator.permissions?.query)return 'unknown';
  try{
    const result=await navigator.permissions.query({name:'geolocation'});
    navigationState.permissionState=result.state;
    result.onchange=()=>{
      navigationState.permissionState=result.state;
      if(result.state==='granted')permissionHelp('',false);
      if(result.state==='denied')permissionHelp('Location is blocked for XPLORE. Open this site’s browser permissions, set Location to Allow, then tap Track live location again.');
    };
    return result.state;
  }catch(error){
    return 'unknown';
  }
}

function permissionError(error){
  const message=geolocationMessage(error);
  setLocationStatus(message,false,true);
  setStatus(message,true);
  if(error?.code===1){
    permissionHelp('Location access is blocked or was declined. In your browser site settings, allow Location for utpal-mishra.github.io, then retry.');
  }
}

function requestFirstLocation(){
  return new Promise(resolve=>{
    navigator.geolocation.getCurrentPosition(position=>resolve(position),error=>{
      permissionError(error);resolve(null);
    },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  });
}

async function startLiveWithPermission(){
  if(!navigator.geolocation){
    setLocationStatus('Geolocation is not supported by this browser.',false,true);
    return false;
  }
  if(state.liveTracking)return true;

  const permission=await geolocationPermissionState();
  if(permission==='denied'){
    setLocationStatus('Location blocked in browser settings',false,true);
    setStatus('XPLORE cannot request GPS until browser Location permission is enabled.',true);
    permissionHelp('Location is blocked for XPLORE. Open this site’s browser permissions, set Location to Allow, then tap Track live location again.');
    return false;
  }

  permissionHelp(permission==='prompt'?'Your browser should now ask for Location access. Choose Allow while using the site.':'Waiting for a precise GPS fix…',true);
  setLocationStatus(permission==='prompt'?'Waiting for Location permission…':'Starting live GPS…',true);
  setStatus(permission==='prompt'?'Please allow Location access in the browser prompt.':'Starting live location…');

  // getCurrentPosition is used deliberately before watchPosition to make the
  // permission request explicit on mobile browsers.
  const firstPosition=await requestFirstLocation();
  if(!firstPosition)return false;

  permissionHelp('',false);
  startLiveTracking();
  handleLivePosition(firstPosition);
  return true;
}

function compassLabel(degrees){
  if(!Number.isFinite(degrees))return '—';
  const labels=['N','NE','E','SE','S','SW','W','NW'];
  return `${labels[Math.round(((degrees%360)+360)%360/45)%8]} · ${Math.round(((degrees%360)+360)%360)}°`;
}

function bearingBetween(a,b){
  const rad=Math.PI/180,deg=180/Math.PI;
  const p1=a.lat*rad,p2=b.lat*rad,dLon=(b.lon-a.lon)*rad;
  const y=Math.sin(dLon)*Math.cos(p2);
  const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dLon);
  return (Math.atan2(y,x)*deg+360)%360;
}

function routeCoordinates(route){
  return route?.raw?.geometry?.coordinates||route?.geometry?.coordinates||[];
}

function projectedSegmentInfo(location,a,b){
  const lat0=location.lat*Math.PI/180;
  const xScale=111320*Math.cos(lat0),yScale=110540;
  const ax=(a[0]-location.lon)*xScale,ay=(a[1]-location.lat)*yScale;
  const bx=(b[0]-location.lon)*xScale,by=(b[1]-location.lat)*yScale;
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;
  const t=len2?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/len2)):0;
  const px=ax+t*dx,py=ay+t*dy;
  return {distance:Math.hypot(px,py),t};
}

function routeProgressInfo(route,location){
  const coords=routeCoordinates(route);
  if(coords.length<2)return {progress:0,remaining:route.raw?.distance||0,offRouteDistance:Infinity,index:0};
  const cumulative=[0];
  for(let i=1;i<coords.length;i++){
    cumulative.push(cumulative[i-1]+distanceMeters({lat:coords[i-1][1],lon:coords[i-1][0]},{lat:coords[i][1],lon:coords[i][0]}));
  }
  let best={distance:Infinity,index:0,t:0};
  for(let i=0;i<coords.length-1;i++){
    const info=projectedSegmentInfo(location,coords[i],coords[i+1]);
    if(info.distance<best.distance)best={distance:info.distance,index:i,t:info.t};
  }
  const segLength=cumulative[best.index+1]-cumulative[best.index];
  const along=cumulative[best.index]+segLength*best.t;
  const total=Math.max(cumulative[cumulative.length-1],1);
  return {progress:Math.max(0,Math.min(1,along/total)),remaining:Math.max(0,total-along),offRouteDistance:best.distance,index:best.index,total};
}

function routeSteps(route){
  return (route?.raw?.legs||route?.legs||[]).flatMap(leg=>leg.steps||[]);
}

function nearestRouteIndex(coords,location){
  let best=0,bestD=Infinity;
  coords.forEach((coord,index)=>{
    const d=distanceMeters(location,{lat:coord[1],lon:coord[0]});
    if(d<bestD){bestD=d;best=index;}
  });
  return best;
}

function nextManeuver(route,location,currentRouteIndex){
  const coords=routeCoordinates(route),steps=routeSteps(route);
  if(!coords.length||!steps.length)return null;
  for(const step of steps){
    const loc=step?.maneuver?.location;
    if(!loc)continue;
    const maneuverLocation={lat:loc[1],lon:loc[0]};
    const idx=nearestRouteIndex(coords,maneuverLocation);
    if(idx>=currentRouteIndex-1&&step.maneuver.type!=='depart'){
      return {step,location:maneuverLocation,distance:distanceMeters(location,maneuverLocation),routeIndex:idx};
    }
  }
  const arrive=steps.find(step=>step?.maneuver?.type==='arrive');
  if(arrive?.maneuver?.location){
    const loc={lat:arrive.maneuver.location[1],lon:arrive.maneuver.location[0]};
    return {step:arrive,location:loc,distance:distanceMeters(location,loc),routeIndex:coords.length-1};
  }
  return null;
}

function manoeuvreInstruction(step){
  if(!step)return 'Continue on the selected route';
  const m=step.maneuver||{},modifier=(m.modifier||'').replace(/_/g,' '),road=step.name?` onto ${step.name}`:'';
  if(m.type==='arrive')return 'Arrive at your destination';
  if(m.type==='depart')return `Start${road}`;
  if(m.type==='roundabout'||m.type==='rotary')return `Enter the roundabout${m.exit?` and take exit ${m.exit}`:''}${road}`;
  if(m.type==='merge')return `Merge ${modifier}${road}`.replace(/\s+/g,' ').trim();
  if(m.type==='fork')return `Keep ${modifier}${road}`.replace(/\s+/g,' ').trim();
  if(m.type==='end of road')return `At the end of the road, turn ${modifier}${road}`.replace(/\s+/g,' ').trim();
  if(m.type==='continue'||m.type==='new name')return `Continue ${modifier}${road}`.replace(/\s+/g,' ').trim();
  return `Turn ${modifier}${road}`.replace(/\s+/g,' ').trim();
}

function speak(text){
  if(!navigationState.voice||!('speechSynthesis'in window)||!text)return;
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.rate=1;utterance.pitch=1;
  window.speechSynthesis.speak(utterance);
}

function updateHeadingMarker(location,heading){
  if(!Number.isFinite(heading)||!navigationState.active)return;
  const html=`<div class="xplore-heading-arrow" style="transform:rotate(${Math.round(heading)}deg)"><span>▲</span></div>`;
  const icon=L.divIcon({className:'xplore-heading-icon',html,iconSize:[32,32],iconAnchor:[16,16]});
  if(!navigationState.headingMarker){
    navigationState.headingMarker=L.marker([location.lat,location.lon],{icon,interactive:false,zIndexOffset:1200}).addTo(state.map);
  }else{
    navigationState.headingMarker.setLatLng([location.lat,location.lon]);
    navigationState.headingMarker.setIcon(icon);
  }
}

function removeHeadingMarker(){
  if(navigationState.headingMarker&&state.map?.hasLayer(navigationState.headingMarker))state.map.removeLayer(navigationState.headingMarker);
  navigationState.headingMarker=null;
}

function activeNavigationRoute(){
  return state.enrichedRoutes?.[state.activeRoute]||null;
}

function setGuidanceStatus(text,tone='normal'){
  const el=$('guidanceState');if(!el)return;
  el.textContent=text;
  el.dataset.tone=tone;
}

function updateGuidance(location){
  if(!navigationState.active||!location)return;
  const route=activeNavigationRoute();if(!route)return;
  const progress=routeProgressInfo(route,location);
  const next=nextManeuver(route,location,progress.index);
  let heading=location.heading;
  if(!Number.isFinite(heading)&&navigationState.previousLocation&&distanceMeters(navigationState.previousLocation,location)>3){
    heading=bearingBetween(navigationState.previousLocation,location);
  }
  navigationState.previousLocation={...location};
  updateHeadingMarker(location,heading);

  const pct=Math.round(progress.progress*100);
  $('guidanceProgressFill').style.width=`${pct}%`;
  $('guidanceProgress').textContent=`${pct}%`;
  $('guidanceRemaining').textContent=formatDistance(progress.remaining);
  $('guidanceHeading').textContent=compassLabel(heading);

  if(next){
    const instruction=manoeuvreInstruction(next.step);
    $('guidanceInstruction').textContent=instruction;
    $('guidanceDistance').textContent=next.step?.maneuver?.type==='arrive'&&next.distance<30?'Arriving':formatDistance(next.distance);
    const key=`${next.step?.maneuver?.type}|${next.step?.maneuver?.modifier}|${next.step?.maneuver?.location?.join(',')}`;
    if(key!==navigationState.lastInstructionKey&&next.distance<500){
      navigationState.lastInstructionKey=key;
      speak(`${formatDistance(next.distance)}. ${instruction}`);
    }
  }else{
    $('guidanceInstruction').textContent='Continue on the selected route';
    $('guidanceDistance').textContent=formatDistance(progress.remaining);
  }

  const threshold=Math.max(state.mode==='walking'?35:state.mode==='cycling'?45:65,(location.accuracy||0)+20);
  if(progress.remaining<30&&progress.progress>.95){
    setGuidanceStatus('Arriving','success');
    $('guidanceInstruction').textContent='You have arrived';
    if(navigationState.lastInstructionKey!=='arrived'){navigationState.lastInstructionKey='arrived';speak('You have arrived at your destination.');}
  }else if(progress.offRouteDistance>threshold){
    setGuidanceStatus(`Off route · ${Math.round(progress.offRouteDistance)} m away`,'warning');
    const now=Date.now();
    if(now-navigationState.lastOffRouteRerouteAt>30000&&typeof refreshRouteFromLiveLocation==='function'){
      navigationState.lastOffRouteRerouteAt=now;
      refreshRouteFromLiveLocation(true);
    }
  }else{
    setGuidanceStatus('On route','success');
  }

  // Follow the user only in active guidance mode; browsing/route selection remains free-pan.
  state.map.panTo([location.lat,location.lon],{animate:true,duration:.45});
}

async function startGuidance(){
  if(!activeNavigationRoute()){
    setStatus('Find a route before starting guidance.',true);return;
  }
  if(!state.liveTracking){
    const started=await startLiveWithPermission();
    if(!started)return;
  }
  navigationState.active=true;
  navigationState.lastInstructionKey=null;
  navigationState.previousLocation=null;
  $('guidancePanel').hidden=false;
  $('startGuidance').textContent='Stop Guidance';
  $('startGuidance').classList.add('active');
  $('voiceGuidance').disabled=!('speechSynthesis'in window);
  setGuidanceStatus('Waiting for GPS…');
  if(state.livePosition)updateGuidance(state.livePosition);
}

function stopGuidance(){
  navigationState.active=false;
  navigationState.previousLocation=null;
  navigationState.lastInstructionKey=null;
  removeHeadingMarker();
  $('guidancePanel').hidden=true;
  $('startGuidance').textContent='Start Guidance';
  $('startGuidance').classList.remove('active');
  if('speechSynthesis'in window)window.speechSynthesis.cancel();
}

function toggleVoice(){
  if(!('speechSynthesis'in window))return;
  navigationState.voice=!navigationState.voice;
  const button=$('voiceGuidance');
  button.classList.toggle('active',navigationState.voice);
  button.setAttribute('aria-pressed',String(navigationState.voice));
  button.textContent=navigationState.voice?'Voice On':'Voice Off';
  if(navigationState.voice&&navigationState.active&&$('guidanceInstruction').textContent)speak($('guidanceInstruction').textContent);
}

const navigationBaseHandleLivePosition=handleLivePosition;
handleLivePosition=function(position){
  navigationBaseHandleLivePosition(position);
  if(navigationState.active)updateGuidance(state.livePosition);
};

const navigationBaseSelectRoute=selectRoute;
selectRoute=function(index,enriched){
  navigationBaseSelectRoute(index,enriched);
  if($('startGuidance'))$('startGuidance').disabled=false;
  if(navigationState.active&&state.livePosition){
    navigationState.lastInstructionKey=null;
    updateGuidance(state.livePosition);
  }
};

const navigationBaseStopLiveTracking=stopLiveTracking;
stopLiveTracking=function(keepLast=true){
  navigationBaseStopLiveTracking(keepLast);
  if(navigationState.active)stopGuidance();
};

document.addEventListener('DOMContentLoaded',async()=>{
  const liveButton=$('toggleLive');
  if(liveButton)liveButton.onclick=async()=>{
    if(state.liveTracking)stopLiveTracking(true);
    else await startLiveWithPermission();
  };
  $('startGuidance').onclick=()=>navigationState.active?stopGuidance():startGuidance();
  $('voiceGuidance').onclick=toggleVoice;
  $('voiceGuidance').disabled=!('speechSynthesis'in window);
  await geolocationPermissionState();
  if(navigationState.permissionState==='denied'){
    setLocationStatus('Location blocked in browser settings',false,true);
    permissionHelp('Location is blocked for XPLORE. Open this site’s browser permissions, set Location to Allow, then retry.');
  }
});
