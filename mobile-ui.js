// XPLORE Ireland v0.4.4 — natural colour cartography + mobile map polish.
// Color mode now uses a conventional geographic palette on top of OpenFreeMap
// vector data: blue water, differentiated green land cover and readable roads.

const XPLORE_MAP_STYLES={
  dark:'https://tiles.openfreemap.org/styles/dark',
  color:'https://tiles.openfreemap.org/styles/bright'
};

const XPLORE_NATURAL_PALETTE={
  land:'#e8e5d6',
  water:'#82c7e8',
  waterLine:'#66afd3',
  forest:'#7faa72',
  park:'#b4d69b',
  farmland:'#cfdbad',
  wetland:'#acd0bd',
  sand:'#ead8a8'
};

const xploreMobileUIState={baseStyle:'dark'};

function xploreIsPhone(){
  return window.matchMedia?.('(max-width:760px)').matches===true;
}

function xploreMapWrap(){
  return document.querySelector('.map-wrap');
}

function loadMobilePolishStyles(){
  if(document.querySelector('link[data-xplore-mobile-polish]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='mobile-polish.css?v=0.4.4';
  link.dataset.xploreMobilePolish='true';
  document.head.appendChild(link);
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

function xploreSetPaint(map,layerId,property,value){
  try{map.setPaintProperty(layerId,property,value);}catch(error){}
}

function xploreNaturalRole(layer){
  const id=String(layer?.id||'').toLowerCase();
  const sourceLayer=String(layer?.['source-layer']||'').toLowerCase();

  if(layer?.type==='background')return 'land';
  if(sourceLayer==='water'||/(^|[-_ ])(water|ocean|sea|lake)([-_ ]|$)/.test(id))return 'water';
  if(sourceLayer==='waterway'||/(river|stream|canal|waterway)/.test(id))return 'waterway';
  if(/(forest|wood)/.test(id))return 'forest';
  if(/(wetland|marsh|bog)/.test(id))return 'wetland';
  if(/(farmland|farm|meadow|orchard|vineyard|agricultur)/.test(id))return 'farmland';
  if(/(park|garden|grass|green|recreation|nature[-_ ]?reserve)/.test(id))return 'park';
  if(/(sand|beach|dune)/.test(id))return 'sand';
  return null;
}

function applyXploreNaturalPalette(map){
  if(!map?.getStyle)return;
  const apply=()=>{
    const layers=map.getStyle()?.layers||[];
    layers.forEach(layer=>{
      const role=xploreNaturalRole(layer);
      if(!role)return;

      if(role==='land'&&layer.type==='background'){
        xploreSetPaint(map,layer.id,'background-color',XPLORE_NATURAL_PALETTE.land);
        return;
      }

      if(role==='water'){
        if(layer.type==='fill'){
          xploreSetPaint(map,layer.id,'fill-color',XPLORE_NATURAL_PALETTE.water);
          xploreSetPaint(map,layer.id,'fill-outline-color',XPLORE_NATURAL_PALETTE.waterLine);
        }else if(layer.type==='line'){
          xploreSetPaint(map,layer.id,'line-color',XPLORE_NATURAL_PALETTE.waterLine);
        }
        return;
      }

      if(role==='waterway'&&layer.type==='line'){
        xploreSetPaint(map,layer.id,'line-color',XPLORE_NATURAL_PALETTE.waterLine);
        return;
      }

      if(layer.type!=='fill')return;
      const color=role==='forest'?XPLORE_NATURAL_PALETTE.forest:
        role==='wetland'?XPLORE_NATURAL_PALETTE.wetland:
        role==='farmland'?XPLORE_NATURAL_PALETTE.farmland:
        role==='sand'?XPLORE_NATURAL_PALETTE.sand:
        XPLORE_NATURAL_PALETTE.park;
      xploreSetPaint(map,layer.id,'fill-color',color);
    });
  };

  if(map.isStyleLoaded?.())apply();
  else map.once?.('idle',apply);
}

function updateMapStyleButton(){
  const button=document.getElementById('xploreMapStyleToggle');
  if(!button)return;
  const color=xploreMobileUIState.baseStyle==='color';
  button.classList.toggle('active',color);
  button.setAttribute('aria-pressed',String(color));
  button.innerHTML=`Natural <span>${color?'On':'Off'}</span>`;
  button.title=color?'Use XPLORE dark map':'Use natural geographic colours';
}

function applyBrowseMapStyle(style,{remember=true}={}){
  const next=style==='color'?'color':'dark';
  xploreMobileUIState.baseStyle=next;
  const url=XPLORE_MAP_STYLES[next];

  browseMapLibreMaps().forEach(map=>{
    try{
      map.setStyle(url);
      map.once?.('idle',()=>{
        if(next==='color')applyXploreNaturalPalette(map);
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
  if(state?.map?.attributionControl?.setPrefix)state.map.attributionControl.setPrefix(false);
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

function activateMobileUIV044(){
  loadMobilePolishStyles();
  installRouteVisibilityHooks();
  syncRouteReadyState();
  addMapStyleToggle();
  compactLeafletAttribution();
  restoreMapStylePreference();
  window.setTimeout(setCloserPhoneDefaultView,500);

  const badge=document.querySelector('.header-meta .pill');
  if(badge)badge.textContent='Ireland v0.4.4';
  if(typeof IRELAND_NETWORK!=='undefined')IRELAND_NETWORK.version='Ireland v0.4.4';
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activateMobileUIV044,{once:true});
else activateMobileUIV044();
