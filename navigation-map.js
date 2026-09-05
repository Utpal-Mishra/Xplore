const nativeNavigationMapState={
  map:null,
  loaded:false,
  follow:true,
  userMarker:null,
  destinationMarker:null,
  lastBearing:0,
  pendingSync:false
};

function xploreHighQualityPixelRatio(){
  const device=Number(window.devicePixelRatio)||1;
  // Raise 1x displays above native resolution while capping GPU cost on dense mobile screens.
  return Math.min(Math.max(device,1.75),3);
}

function tuneBrowseMapResolution(){
  if(!state?.map?.eachLayer)return;
  state.map.eachLayer(layer=>{
    if(typeof layer.getMaplibreMap!=='function')return;
    try{
      const glMap=layer.getMaplibreMap();
      if(glMap?.setPixelRatio)glMap.setPixelRatio(xploreHighQualityPixelRatio());
      if(glMap?.setMaxZoom)glMap.setMaxZoom(22);
    }catch(error){
      console.warn('XPLORE HQ vector tuning unavailable.',error);
    }
  });
}

function lineFeature(coordinates){
  return {
    type:'Feature',
    properties:{},
    geometry:{type:'LineString',coordinates:coordinates.length>=2?coordinates:[[0,0],[0,0]]}
  };
}

function setNavSource(id,coordinates){
  const source=nativeNavigationMapState.map?.getSource(id);
  if(source)source.setData(lineFeature(coordinates));
}

function addNavigationLayers(){
  const map=nativeNavigationMapState.map;
  if(!map||map.getSource('xplore-nav-route'))return;

  map.addSource('xplore-nav-route',{type:'geojson',data:lineFeature([])});
  map.addSource('xplore-nav-travelled',{type:'geojson',data:lineFeature([])});
  map.addSource('xplore-nav-remaining',{type:'geojson',data:lineFeature([])});
  map.addSource('xplore-nav-gps-link',{type:'geojson',data:lineFeature([])});

  map.addLayer({
    id:'xplore-nav-route-casing',type:'line',source:'xplore-nav-route',
    layout:{'line-cap':'round','line-join':'round'},
    paint:{'line-color':'#06100c','line-width':12,'line-opacity':.92}
  });
  map.addLayer({
    id:'xplore-nav-route-base',type:'line',source:'xplore-nav-route',
    layout:{'line-cap':'round','line-join':'round'},
    paint:{'line-color':'#60736a','line-width':7,'line-opacity':.42}
  });
  map.addLayer({
    id:'xplore-nav-travelled-line',type:'line',source:'xplore-nav-travelled',
    layout:{'line-cap':'round','line-join':'round'},
    paint:{'line-color':'#75877e','line-width':7,'line-opacity':.48}
  });
  map.addLayer({
    id:'xplore-nav-remaining-line',type:'line',source:'xplore-nav-remaining',
    layout:{'line-cap':'round','line-join':'round'},
    paint:{'line-color':'#5ee394','line-width':8,'line-opacity':.99}
  });
  map.addLayer({
    id:'xplore-nav-gps-link-line',type:'line',source:'xplore-nav-gps-link',
    layout:{'line-cap':'round','line-join':'round'},
    paint:{'line-color':'#e5b85c','line-width':3,'line-opacity':.88,'line-dasharray':[1.2,1.8]}
  });
}

function createUserPuck(){
  const el=document.createElement('div');
  el.className='native-navigation-puck';
  el.innerHTML='<span class="native-navigation-chevron">▲</span>';
  return el;
}

function createDestinationPuck(){
  const el=document.createElement('div');
  el.className='native-destination-puck';
  el.innerHTML='<span></span>';
  return el;
}

function navigationZoom(location){
  const speedKmh=Number.isFinite(location?.speed)?location.speed*3.6:0;
  if(state.mode==='walking')return 18.2;
  if(state.mode==='cycling')return speedKmh>28?16.9:17.6;
  if(speedKmh>80)return 15.8;
  if(speedKmh>45)return 16.4;
  return 17.2;
}

function navigationPitch(){
  if(state.mode==='walking')return 46;
  if(state.mode==='cycling')return 54;
  return 58;
}

function navigationBearing(location,route,progress){
  if(Number.isFinite(location?.heading))return ((location.heading%360)+360)%360;
  const coords=routeCoordinates(route);
  if(coords.length){
    const target=coords[Math.min(coords.length-1,(progress?.index||0)+4)];
    if(target){
      const bearing=bearingBetween(location,{lat:target[1],lon:target[0]});
      if(Number.isFinite(bearing))return bearing;
    }
  }
  return nativeNavigationMapState.lastBearing||0;
}

function nearestNavigationRouteProjection(location,coords){
  if(coords.length<2)return {index:0,t:0,distance:Infinity,coordinate:coords[0]||[location.lon,location.lat]};
  let best={index:0,t:0,distance:Infinity,coordinate:coords[0]};
  for(let i=0;i<coords.length-1;i++){
    const info=projectedSegmentInfo(location,coords[i],coords[i+1]);
    if(info.distance>=best.distance)continue;
    const t=info.t;
    best={
      index:i,
      t,
      distance:info.distance,
      coordinate:[
        coords[i][0]+(coords[i+1][0]-coords[i][0])*t,
        coords[i][1]+(coords[i+1][1]-coords[i][1])*t
      ]
    };
  }
  return best;
}

function navigationRouteSegments(route,location){
  const coords=routeCoordinates(route);
  if(coords.length<2)return {full:coords,travelled:coords,remaining:coords,gpsLink:[],progress:null,matchDistance:Infinity};

  const progress=routeProgressInfo(route,location);
  const match=nearestNavigationRouteProjection(location,coords);
  const split=Math.max(0,Math.min(coords.length-2,match.index));
  const matched=match.coordinate;
  const accuracy=Number.isFinite(location?.accuracy)?location.accuracy:0;
  const offRouteVisualThreshold=Math.max(18,accuracy*1.25);
  const gpsLink=match.distance>offRouteVisualThreshold?[[location.lon,location.lat],matched]:[];

  // Important: route geometry remains on the actual routed path. The raw GPS puck
  // stays at the device position; any meaningful separation is shown separately.
  return {
    full:coords,
    travelled:[...coords.slice(0,split+1),matched],
    remaining:[matched,...coords.slice(split+1)],
    gpsLink,
    progress,
    matchDistance:match.distance,
    matched
  };
}

function updateNativeNavigationMetrics(location,route,progress){
  const etaEl=$('guidanceEta'),speedEl=$('guidanceSpeed'),qualityEl=$('navigationQuality');
  if(etaEl){
    const totalDuration=route?.raw?.duration||route?.duration||0;
    const remainingSeconds=Math.max(0,totalDuration*(1-(progress?.progress||0)));
    const mins=Math.max(0,Math.round(remainingSeconds/60));
    etaEl.textContent=mins<60?`~${mins} min`:`~${Math.floor(mins/60)}h ${mins%60}m`;
  }
  if(speedEl)speedEl.textContent=Number.isFinite(location?.speed)?`${Math.round(location.speed*3.6)} km/h`:'—';
  if(qualityEl)qualityEl.textContent=`HQ · ${xploreHighQualityPixelRatio().toFixed(2)}×`;
}

function navigationCameraPadding(){
  if(window.matchMedia?.('(max-width:760px)').matches){
    return {top:150,bottom:98,left:32,right:32};
  }
  return {top:145,bottom:190,left:45,right:45};
}

function ensureNativeNavigationMap(location){
  const container=$('navigationMap');
  if(!container||typeof maplibregl==='undefined')return null;
  container.hidden=false;
  $('navigationMapControls').hidden=false;
  $('map').setAttribute('aria-hidden','true');

  if(nativeNavigationMapState.map){
    nativeNavigationMapState.map.resize();
    return nativeNavigationMapState.map;
  }

  const map=new maplibregl.Map({
    container,
    style:'https://tiles.openfreemap.org/styles/dark',
    center:[location.lon,location.lat],
    zoom:navigationZoom(location),
    bearing:Number.isFinite(location.heading)?location.heading:0,
    pitch:navigationPitch(),
    minZoom:3,
    maxZoom:22,
    pixelRatio:xploreHighQualityPixelRatio(),
    renderWorldCopies:false,
    attributionControl:false
  });
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'© OpenStreetMap contributors'}),'bottom-left');
  nativeNavigationMapState.map=map;

  map.on('load',()=>{
    nativeNavigationMapState.loaded=true;
    addNavigationLayers();
    if(nativeNavigationMapState.pendingSync&&state.livePosition){
      nativeNavigationMapState.pendingSync=false;
      syncNativeNavigationMap(state.livePosition,true);
    }
  });
  map.on('dragstart',event=>{
    if(event.originalEvent){
      nativeNavigationMapState.follow=false;
      $('recenterNavigation').classList.add('visible');
    }
  });
  map.on('zoomstart',event=>{
    if(event.originalEvent){
      nativeNavigationMapState.follow=false;
      $('recenterNavigation').classList.add('visible');
    }
  });
  return map;
}

function syncNativeNavigationMap(location,forceCamera=false){
  if(!navigationState.active||!location)return;
  const route=activeNavigationRoute();if(!route)return;
  const map=ensureNativeNavigationMap(location);if(!map)return;
  if(!nativeNavigationMapState.loaded){nativeNavigationMapState.pendingSync=true;return;}

  const segments=navigationRouteSegments(route,location);
  setNavSource('xplore-nav-route',segments.full);
  setNavSource('xplore-nav-travelled',segments.travelled);
  setNavSource('xplore-nav-remaining',segments.remaining);
  setNavSource('xplore-nav-gps-link',segments.gpsLink);

  if(!nativeNavigationMapState.userMarker){
    nativeNavigationMapState.userMarker=new maplibregl.Marker({element:createUserPuck(),anchor:'center'})
      .setLngLat([location.lon,location.lat]).addTo(map);
  }else nativeNavigationMapState.userMarker.setLngLat([location.lon,location.lat]);

  const destination=segments.full[segments.full.length-1];
  if(destination){
    if(!nativeNavigationMapState.destinationMarker){
      nativeNavigationMapState.destinationMarker=new maplibregl.Marker({element:createDestinationPuck(),anchor:'center'})
        .setLngLat(destination).addTo(map);
    }else nativeNavigationMapState.destinationMarker.setLngLat(destination);
  }

  const bearing=navigationBearing(location,route,segments.progress);
  nativeNavigationMapState.lastBearing=bearing;
  updateNativeNavigationMetrics(location,route,segments.progress);

  if(nativeNavigationMapState.follow||forceCamera){
    nativeNavigationMapState.follow=true;
    $('recenterNavigation').classList.remove('visible');
    map.easeTo({
      center:[location.lon,location.lat],
      zoom:navigationZoom(location),
      bearing,
      pitch:navigationPitch(),
      padding:navigationCameraPadding(),
      duration:520,
      essential:true
    });
  }
}

function showNativeNavigationViewport(){
  const wrap=document.querySelector('.map-wrap');if(wrap)wrap.classList.add('navigation-active');
  if(state.livePosition)syncNativeNavigationMap(state.livePosition,true);
}

function hideNativeNavigationViewport(){
  const container=$('navigationMap'),controls=$('navigationMapControls');
  if(container)container.hidden=true;
  if(controls)controls.hidden=true;
  $('map')?.removeAttribute('aria-hidden');
  const wrap=document.querySelector('.map-wrap');if(wrap)wrap.classList.remove('navigation-active');
  nativeNavigationMapState.follow=true;
  $('recenterNavigation')?.classList.remove('visible');
}

const nativeMapBaseStartGuidance=startGuidance;
startGuidance=async function(){
  await nativeMapBaseStartGuidance();
  if(navigationState.active)showNativeNavigationViewport();
};

const nativeMapBaseStopGuidance=stopGuidance;
stopGuidance=function(){
  nativeMapBaseStopGuidance();
  hideNativeNavigationViewport();
};

const nativeMapBaseUpdateGuidance=updateGuidance;
updateGuidance=function(location){
  nativeMapBaseUpdateGuidance(location);
  if(navigationState.active)syncNativeNavigationMap(location,false);
};

const nativeMapBaseSelectRoute=selectRoute;
selectRoute=function(index,enriched){
  nativeMapBaseSelectRoute(index,enriched);
  if(navigationState.active&&state.livePosition)syncNativeNavigationMap(state.livePosition,true);
};

document.addEventListener('DOMContentLoaded',()=>{
  // The Leaflet bridge still hosts the comparison map. Raise the internal
  // MapLibre canvas resolution without changing route/context behavior.
  window.setTimeout(tuneBrowseMapResolution,350);
  window.addEventListener('resize',()=>window.setTimeout(tuneBrowseMapResolution,120),{passive:true});

  const recenter=$('recenterNavigation');
  if(recenter)recenter.addEventListener('click',()=>{
    nativeNavigationMapState.follow=true;
    if(state.livePosition)syncNativeNavigationMap(state.livePosition,true);
  });
});
