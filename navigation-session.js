// Route recovery is separate from GPS availability: hidden web pages cannot
// promise background location. No location data is sent to a tracking server.
const journeySession={key:'xplore-navigation-session-v1',restoring:false,resuming:false,epoch:0,awaitingFix:false,wakeLock:null,keepAwake:false};

function saveJourneySession(){
  if(journeySession.restoring)return;
  try{
    if(!navigationState.active||!activeNavigationRoute()){
      sessionStorage.removeItem(journeySession.key);return;
    }
    const center=state.map.getCenter();
    sessionStorage.setItem(journeySession.key,JSON.stringify({
      version:1,savedAt:Date.now(),mode:state.mode,preference:state.preference,
      routes:state.routes,enrichedRoutes:state.enrichedRoutes,activeRoute:state.activeRoute,
      destination:state.lastDestination,position:state.livePosition,context:state.lastContext,
      from:$('from').value,to:$('to').value,voice:navigationState.voice,
      selections:typeof xploreAddressState!=='undefined'?xploreAddressState.selections:null,
      lastRouted:state.lastRoutedLivePosition,lastReroute:state.lastAutoRerouteAt,
      camera:{lat:center.lat,lon:center.lng,zoom:state.map.getZoom()},
      nativeCamera:nativeNavigationMapState.map?{center:nativeNavigationMapState.map.getCenter().toArray(),zoom:nativeNavigationMapState.map.getZoom(),bearing:nativeNavigationMapState.map.getBearing(),pitch:nativeNavigationMapState.map.getPitch()}:null,
      follow:nativeNavigationMapState.follow
    }));
  }catch(error){setStatus('This browser cannot save the journey for reload recovery.',true);}
}

function navigationFreshness(){
  const el=$('navigationTrackingStatus');if(!el)return;
  if(!navigationState.active){el.textContent='Browser tracking pauses when the screen locks. Your active route is saved for recovery.';return;}
  const age=state.livePosition?.timestamp?Math.max(0,Date.now()-state.livePosition.timestamp):Infinity;
  const fresh=!journeySession.awaitingFix&&age<15000;
  el.textContent=fresh?'GPS updating · route saved on this device':
    `Waiting for fresh GPS · ${Number.isFinite(age)?`last fix ${Math.floor(age/1000)}s ago`:'no fix yet'} · route retained`;
  if(!fresh){
    setGuidanceStatus('Waiting for fresh GPS','warning');
    $('guidanceSpeed').textContent='—';
    $('liveMapText').textContent='Last known position · waiting for GPS';
  }
}

async function acquireNavigationWakeLock(){
  if(!journeySession.keepAwake||!navigationState.active||document.visibilityState!=='visible'||journeySession.wakeLock)return;
  if(!navigator.wakeLock){$('keepNavigationAwake').textContent='Keep screen on unavailable';return;}
  try{
    const lock=await navigator.wakeLock.request('screen');
    if(!journeySession.keepAwake||!navigationState.active){await lock.release();return;}
    journeySession.wakeLock=lock;
    lock.addEventListener('release',()=>{if(journeySession.wakeLock===lock)journeySession.wakeLock=null;});
  }catch(error){setStatus('Screen wake lock unavailable. The route will still be saved.',true);}
}

function releaseNavigationWakeLock(){
  const lock=journeySession.wakeLock;journeySession.wakeLock=null;
  if(lock)lock.release().catch(()=>{});
}

function restartNavigationGPS(){
  if(!state.liveTracking||!navigator.geolocation)return;
  journeySession.awaitingFix=true;navigationFreshness();
  const epoch=++journeySession.epoch;
  if(state.watchId!=null)navigator.geolocation.clearWatch(state.watchId);
  const onPosition=position=>{
    if(epoch!==journeySession.epoch||!state.liveTracking)return;
    // Ignore cached/out-of-order fixes, especially on unlock.
    if(Date.now()-position.timestamp>15000||position.timestamp<(state.livePosition?.timestamp||0))return;
    handleLivePosition(position);
  };
  const onError=error=>{
    if(epoch!==journeySession.epoch||!state.liveTracking)return;
    permissionError(error);
    if(error.code===1)stopLiveTracking(true);
    else navigationFreshness();
  };
  state.watchId=navigator.geolocation.watchPosition(onPosition,onError,{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  navigator.geolocation.getCurrentPosition(onPosition,onError,{enableHighAccuracy:true,maximumAge:0,timeout:15000});
}

function resumeJourneySession(){
  if(document.visibilityState!=='visible'||journeySession.resuming)return;
  journeySession.resuming=true;
  requestAnimationFrame(()=>{
    journeySession.resuming=false;
    state.map?.invalidateSize({pan:false});
    if(navigationState.active&&state.livePosition){
      // Reuse map instances and route geometry; do not replan on unlock.
      syncNativeNavigationMap(state.livePosition,false);
      nativeNavigationMapState.map?.resize();
      nativeNavigationMapState.map?.triggerRepaint();
    }
    navigationFreshness();
    restartNavigationGPS();
    acquireNavigationWakeLock();
  });
}

function restoreJourneySession(){
  let saved;
  try{saved=JSON.parse(sessionStorage.getItem(journeySession.key)||'null');}catch(error){}
  if(!saved)return;
  const route=saved.enrichedRoutes?.[saved.activeRoute];
  const validPoint=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
  if(saved.version!==1||!Number.isFinite(saved.savedAt)||Date.now()-saved.savedAt>12*60*60*1000||
    !['walking','cycling','driving'].includes(saved.mode)||!validPoint(saved.destination)||
    !validPoint(saved.position)||!route?.raw?.geometry?.coordinates?.length){
    try{sessionStorage.removeItem(journeySession.key);}catch(error){}return;
  }
  journeySession.restoring=true;journeySession.awaitingFix=true;
  try{
    state.mode=saved.mode;state.preference=saved.preference;
    state.routes=saved.routes;state.enrichedRoutes=saved.enrichedRoutes;
    state.lastDestination=saved.destination;state.lastContext=saved.context;
    state.livePosition=saved.position;
    state.lastRoutedLivePosition=saved.lastRouted||saved.position;
    state.lastAutoRerouteAt=saved.lastReroute||Date.now();
    $('from').value=saved.from;$('to').value=saved.to;
    if(saved.selections&&typeof xploreAddressState!=='undefined')xploreAddressState.selections=saved.selections;
    document.querySelectorAll('.mode').forEach(btn=>btn.classList.toggle('active',btn.dataset.mode===saved.mode));
    document.querySelectorAll('.choice').forEach(btn=>btn.classList.toggle('active',btn.dataset.pref===saved.preference));
    drawRoutes(saved.enrichedRoutes,saved.position,saved.destination);
    renderRoutes(saved.enrichedRoutes);selectRoute(saved.activeRoute,saved.enrichedRoutes);
    if(saved.camera&&validPoint(saved.camera))state.map.setView([saved.camera.lat,saved.camera.lon],saved.camera.zoom,{animate:false});
    // A remembered fix is a display snapshot, not evidence of live GPS.
    navigationState.active=true;navigationState.voice=!!saved.voice;
    $('voiceGuidance').classList.toggle('active',navigationState.voice);
    $('voiceGuidance').setAttribute('aria-pressed',String(navigationState.voice));
    $('voiceGuidance').textContent=navigationState.voice?'Voice On':'Voice Off';
    $('guidancePanel').hidden=false;$('startGuidance').textContent='Stop Guidance';
    $('startGuidance').classList.add('active');
    const voice=navigationState.voice;navigationState.voice=false;
    // Render saved metrics without triggering an automatic reroute from stale GPS.
    const reroute=refreshRouteFromLiveLocation;refreshRouteFromLiveLocation=()=>{};
    try{updateGuidance(saved.position);}finally{refreshRouteFromLiveLocation=reroute;navigationState.voice=voice;}
    showNativeNavigationViewport();nativeNavigationMapState.follow=saved.follow!==false;
    if(saved.follow===false&&saved.nativeCamera)nativeNavigationMapState.map?.jumpTo(saved.nativeCamera);
    state.liveTracking=true;$('from').readOnly=true;
    $('toggleLive').classList.add('active');$('toggleLive').setAttribute('aria-pressed','true');$('toggleLive').textContent='Stop live tracking';
    navigationFreshness();setStatus('Journey restored. Waiting for fresh GPS to resume guidance.');
    restartNavigationGPS();
  }catch(error){
    try{sessionStorage.removeItem(journeySession.key);}catch(storageError){}
    stopGuidance();setStatus('Saved journey could not be restored. Please find the route again.',true);
  }finally{journeySession.restoring=false;}
}

function syncNavigationDockLayout(){
  const wrap=document.querySelector('.map-wrap');
  const dock=wrap?.querySelector('.bottom-left');
  if(!wrap||!dock)return;
  const clearance=Math.max(0,Math.ceil(wrap.getBoundingClientRect().bottom-dock.getBoundingClientRect().top))+12;
  wrap.style.setProperty('--navigation-dock-clearance',`${clearance}px`);
}

function installJourneySession(){
  const baseStart=startGuidance;
  startGuidance=async function(){await baseStart();saveJourneySession();navigationFreshness();requestAnimationFrame(syncNavigationDockLayout);await acquireNavigationWakeLock();};
  const baseStop=stopGuidance;
  stopGuidance=function(){baseStop();releaseNavigationWakeLock();saveJourneySession();navigationFreshness();};
  const basePosition=handleLivePosition;
  handleLivePosition=function(position){
    if(!state.liveTracking||Date.now()-position.timestamp>15000||position.timestamp<(state.livePosition?.timestamp||0))return;
    journeySession.awaitingFix=false;
    basePosition(position);saveJourneySession();navigationFreshness();
  };
  const baseSelect=selectRoute;
  selectRoute=function(){const result=baseSelect.apply(this,arguments);saveJourneySession();return result;};
  const baseReset=resetJourneyPresentation;
  resetJourneyPresentation=function(){const result=baseReset.apply(this,arguments);saveJourneySession();return result;};
  const baseStopTracking=stopLiveTracking;
  stopLiveTracking=function(){journeySession.epoch++;return baseStopTracking.apply(this,arguments);};
  $('keepNavigationAwake').onclick=()=>{
    journeySession.keepAwake=!journeySession.keepAwake;
    $('keepNavigationAwake').setAttribute('aria-pressed',String(journeySession.keepAwake));
    $('keepNavigationAwake').textContent=journeySession.keepAwake?'Keep screen on: On':'Keep screen on: Off';
    if(journeySession.keepAwake)acquireNavigationWakeLock();else releaseNavigationWakeLock();
  };
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){
      saveJourneySession();releaseNavigationWakeLock();
      if(navigationState.active)setGuidanceStatus('Route saved · GPS may pause','warning');
    }else resumeJourneySession();
  });
  window.addEventListener('pagehide',saveJourneySession);
  window.addEventListener('pageshow',resumeJourneySession);
  document.addEventListener('freeze',saveJourneySession);
  document.addEventListener('resume',resumeJourneySession);
  window.addEventListener('online',resumeJourneySession);
  setInterval(()=>{if(document.visibilityState==='visible')navigationFreshness();},5000);
  restoreJourneySession();
  const wrap=document.querySelector('.map-wrap'),dock=wrap?.querySelector('.bottom-left');
  if(wrap&&dock&&typeof ResizeObserver!=='undefined'){
    const observer=new ResizeObserver(()=>requestAnimationFrame(syncNavigationDockLayout));
    observer.observe(dock);observer.observe(wrap);
  }
  window.addEventListener('resize',()=>requestAnimationFrame(syncNavigationDockLayout),{passive:true});
  requestAnimationFrame(syncNavigationDockLayout);
}
installJourneySession();
