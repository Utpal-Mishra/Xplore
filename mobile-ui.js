// XPLORE Ireland v0.4.3 — mobile map polish and planning-mode controls.
// Keeps the planning map clean before a route exists, provides a closer Ireland
// default view on phones, and offers an optional colour basemap without changing
// XPLORE route/context logic.

const XPLORE_MAP_STYLES={
  dark:'https://tiles.openfreemap.org/styles/dark',
  color:'https://tiles.openfreemap.org/styles/liberty'
};

const xploreMobileUIState={
  baseStyle:'dark'
};

function xploreIsPhone(){
  return window.matchMedia?.('(max-width:760px)').matches===true;
}

function xploreMapWrap(){
  return document.querySelector('.map-wrap');
}

function setRouteReady(ready){
  const wrap=xploreMapWrap();
  if(wrap)wrap.classList.toggle('route-ready',Boolean(ready));
}

function syncRouteReadyState(){
  setRouteReady(Boolean(state?.enrichedRoutes?.length||state?.routes?.length));
}

function setCloserPhoneDefaultView(){
  if(!xploreIsPhone()||!state?.map||state.livePosition||state.routes?.length)return;
  // At zoom 7 the island remains recognisable while avoiding the excessively
  // distant UK/Atlantic framing produced by fitBounds on a tall phone viewport.
  state.map.setView([53.40,-8.05],7,{animate:false});
}

function browseMapLibreMaps(){
  const maps=[];
  if(!state?.map?.eachLayer)return maps;
  state.map.eachLayer(layer=>{
    if(typeof layer.getMaplibreMap!=='function')return;
    try{
      const map=layer.getMaplibreMap();
      if(map)maps.push(map);
    }catch(error){
      console.warn('XPLORE basemap style control unavailable for one layer.',error);
    }
  });
  return maps;
}

function updateMapStyleButton(){
  const button=document.getElementById('xploreMapStyleToggle');
  if(!button)return;
  const color=xploreMobileUIState.baseStyle==='color';
  button.classList.toggle('active',color);
  button.setAttribute('aria-pressed',String(color));
  button.innerHTML=`Color <span>${color?'On':'Off'}</span>`;
  button.title=color?'Use XPLORE dark map':'Use a colour OpenFreeMap basemap';
}

function applyBrowseMapStyle(style,{remember=true}={}){
  const next=style==='color'?'color':'dark';
  xploreMobileUIState.baseStyle=next;
  const url=XPLORE_MAP_STYLES[next];
  browseMapLibreMaps().forEach(map=>{
    try{
      map.setStyle(url);
      map.once?.('styledata',()=>{
        if(typeof tuneBrowseMapResolution==='function')window.setTimeout(tuneBrowseMapResolution,60);
      });
    }catch(error){
      console.warn('XPLORE could not switch basemap style.',error);
    }
  });
  if(remember){
    try{localStorage.setItem('xplore-map-style',next);}catch(error){}
  }
  updateMapStyleButton();
}

function addMapStyleToggle(){
  const actions=document.querySelector('.map-layer-actions');
  if(!actions||document.getElementById('xploreMapStyleToggle'))return;
  const button=document.createElement('button');
  button.id='xploreMapStyleToggle';
  button.type='button';
  button.className='map-style-toggle';
  button.setAttribute('aria-pressed','false');
  button.addEventListener('click',()=>{
    applyBrowseMapStyle(xploreMobileUIState.baseStyle==='color'?'dark':'color');
  });
  actions.appendChild(button);
  updateMapStyleButton();
}

function restoreMapStylePreference(){
  let saved='dark';
  try{saved=localStorage.getItem('xplore-map-style')||'dark';}catch(error){}
  if(saved!=='color')saved='dark';
  xploreMobileUIState.baseStyle=saved;
  updateMapStyleButton();
  if(saved==='color')window.setTimeout(()=>applyBrowseMapStyle('color',{remember:false}),450);
}

function compactLeafletAttribution(){
  if(state?.map?.attributionControl?.setPrefix){
    // Leaflet is BSD licensed; retain the actual OpenFreeMap/OpenMapTiles/OSM
    // data attribution while removing the framework branding from this tiny UI.
    state.map.attributionControl.setPrefix(false);
  }
}

function installRouteVisibilityHooks(){
  const baseRenderRoutes=renderRoutes;
  renderRoutes=function(enriched){
    const result=baseRenderRoutes.apply(this,arguments);
    setRouteReady(Boolean(enriched?.length));
    return result;
  };

  if(typeof resetJourneyPresentation==='function'){
    const baseResetJourneyPresentation=resetJourneyPresentation;
    resetJourneyPresentation=function(message){
      setRouteReady(false);
      return baseResetJourneyPresentation.apply(this,arguments);
    };
  }
}

function activateMobileUIV043(){
  installRouteVisibilityHooks();
  syncRouteReadyState();
  addMapStyleToggle();
  compactLeafletAttribution();
  restoreMapStylePreference();
  window.setTimeout(setCloserPhoneDefaultView,500);

  const badge=document.querySelector('.header-meta .pill');
  if(badge)badge.textContent='Ireland v0.4.3';
  if(typeof IRELAND_NETWORK!=='undefined')IRELAND_NETWORK.version='Ireland v0.4.3';
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activateMobileUIV043,{once:true});
else activateMobileUIV043();
