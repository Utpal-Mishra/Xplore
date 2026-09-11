// XPLORE Ireland v0.4.5 — mobile layer menu + richer natural cartography.
// Natural mode emphasises geographic context while the compact layer menu keeps
// the planning map clear on phones.

const XPLORE_MAP_STYLES={
  dark:'https://tiles.openfreemap.org/styles/dark',
  color:'https://tiles.openfreemap.org/styles/bright'
};

const XPLORE_NATURAL_PALETTE={
  land:'#eee9da',
  water:'#68bfe5',
  waterLine:'#439fc9',
  forest:'#6f9f68',
  park:'#add394',
  farmland:'#d4ddb0',
  wetland:'#9fc9b9',
  sand:'#ead7a2',
  scrub:'#9fbd82',
  rock:'#d6d0c1',
  residential:'#e8e4d9',
  industrial:'#ddd5c6',
  boundary:'#9d9a87',
  label:'#25332c',
  labelHalo:'#f7f3e8'
};

const xploreMobileUIState={baseStyle:'dark',layersOpen:false};

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
  link.href='mobile-polish.css?v=0.4.5';
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
  // Keep the whole island recognisable, but closer than the previous wide frame.
  state.map.setView([53.36,-8.12],7.15,{animate:false});
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

function xploreSetLayout(map,layerId,property,value){
  try{map.setLayoutProperty(layerId,property,value);}catch(error){}
}

function xploreSetLayerRange(map,layerId,minZoom,maxZoom=24){
  try{map.setLayerZoomRange(layerId,minZoom,maxZoom);}catch(error){}
}

function xploreNaturalRole(layer){
  const id=String(layer?.id||'').toLowerCase();
  const sourceLayer=String(layer?.['source-layer']||'').toLowerCase();

  if(layer?.type==='background')return 'land';
  if(sourceLayer==='water'||/(^|[-_ ])(water|ocean|sea|lake)([-_ ]|$)/.test(id))return 'water';
  if(sourceLayer==='waterway'||/(river|stream|canal|waterway)/.test(id))return 'waterway';
  if(sourceLayer==='boundary'||/(boundary|admin)/.test(id))return 'boundary';
  if(sourceLayer==='place'||/(place|city|town|village|country|state)/.test(id))return 'place';
  if(sourceLayer==='landcover')return 'landcover';
  if(sourceLayer==='landuse')return 'landuse';
  if(sourceLayer==='park')return 'park';
  if(/(forest|wood)/.test(id))return 'forest';
  if(/(wetland|marsh|bog)/.test(id))return 'wetland';
  if(/(farmland|farm|meadow|orchard|vineyard|agricultur)/.test(id))return 'farmland';
  if(/(park|garden|grass|green|recreation|nature[-_ ]?reserve)/.test(id))return 'park';
  if(/(sand|beach|dune)/.test(id))return 'sand';
  return null;
}

function naturalLandcoverExpression(){
  return ['match',['get','class'],
    'wood',XPLORE_NATURAL_PALETTE.forest,
    'forest',XPLORE_NATURAL_PALETTE.forest,
    'grass',XPLORE_NATURAL_PALETTE.park,
    'farmland',XPLORE_NATURAL_PALETTE.farmland,
    'farm',XPLORE_NATURAL_PALETTE.farmland,
    'meadow',XPLORE_NATURAL_PALETTE.farmland,
    'wetland',XPLORE_NATURAL_PALETTE.wetland,
    'scrub',XPLORE_NATURAL_PALETTE.scrub,
    'sand',XPLORE_NATURAL_PALETTE.sand,
    'rock',XPLORE_NATURAL_PALETTE.rock,
    XPLORE_NATURAL_PALETTE.park
  ];
}

function naturalLanduseExpression(){
  return ['match',['get','class'],
    'residential',XPLORE_NATURAL_PALETTE.residential,
    'commercial',XPLORE_NATURAL_PALETTE.residential,
    'industrial',XPLORE_NATURAL_PALETTE.industrial,
    'railway',XPLORE_NATURAL_PALETTE.industrial,
    'cemetery','#c4d2ad',
    'school','#eee0c3',
    'hospital','#efe0c7',
    'park',XPLORE_NATURAL_PALETTE.park,
    XPLORE_NATURAL_PALETTE.residential
  ];
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

      if(role==='boundary'&&layer.type==='line'){
        xploreSetPaint(map,layer.id,'line-color',XPLORE_NATURAL_PALETTE.boundary);
        xploreSetPaint(map,layer.id,'line-opacity',.56);
        return;
      }

      if(role==='place'&&layer.type==='symbol'){
        xploreSetPaint(map,layer.id,'text-color',XPLORE_NATURAL_PALETTE.label);
        xploreSetPaint(map,layer.id,'text-halo-color',XPLORE_NATURAL_PALETTE.labelHalo);
        xploreSetPaint(map,layer.id,'text-halo-width',1.15);
        const id=String(layer.id||'').toLowerCase();
        if(/city|capital|country/.test(id))xploreSetLayerRange(map,layer.id,4);
        else if(/town/.test(id))xploreSetLayerRange(map,layer.id,6.4);
        else if(/village|suburb/.test(id))xploreSetLayerRange(map,layer.id,8.2);
        return;
      }

      if(layer.type!=='fill')return;
      if(role==='landcover'){
        xploreSetPaint(map,layer.id,'fill-color',naturalLandcoverExpression());
        xploreSetPaint(map,layer.id,'fill-opacity',.78);
        return;
      }
      if(role==='landuse'){
        xploreSetPaint(map,layer.id,'fill-color',naturalLanduseExpression());
        xploreSetPaint(map,layer.id,'fill-opacity',.64);
        return;
      }

      const color=role==='forest'?XPLORE_NATURAL_PALETTE.forest:
        role==='wetland'?XPLORE_NATURAL_PALETTE.wetland:
        role==='farmland'?XPLORE_NATURAL_PALETTE.farmland:
        role==='sand'?XPLORE_NATURAL_PALETTE.sand:
        XPLORE_NATURAL_PALETTE.park;
      xploreSetPaint(map,layer.id,'fill-color',color);
      xploreSetPaint(map,layer.id,'fill-opacity',.78);
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

function setLayerMenuOpen(open){
  xploreMobileUIState.layersOpen=Boolean(open);
  const panel=document.querySelector('.map-layer-panel');
  const button=document.getElementById('xploreLayerMenuToggle');
  if(panel)panel.classList.toggle('layer-menu-open',xploreMobileUIState.layersOpen);
  if(button){
    button.setAttribute('aria-expanded',String(xploreMobileUIState.layersOpen));
    button.innerHTML=`Layers <span>${xploreMobileUIState.layersOpen?'×':'+'}</span>`;
  }
}

function addLayerMenuToggle(){
  const panel=document.querySelector('.map-layer-panel');
  const actions=panel?.querySelector('.map-layer-actions');
  if(!panel||!actions||document.getElementById('xploreLayerMenuToggle'))return;

  const button=document.createElement('button');
  button.id='xploreLayerMenuToggle';
  button.type='button';
  button.className='map-layer-menu-toggle';
  button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-label','Open map layers');
  button.addEventListener('click',event=>{
    event.stopPropagation();
    setLayerMenuOpen(!xploreMobileUIState.layersOpen);
  });
  panel.insertBefore(button,actions);
  setLayerMenuOpen(false);

  state?.map?.on?.('click',()=>setLayerMenuOpen(false));
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

function activateMobileUIV045(){
  loadMobilePolishStyles();
  installRouteVisibilityHooks();
  syncRouteReadyState();
  addMapStyleToggle();
  addLayerMenuToggle();
  compactLeafletAttribution();
  restoreMapStylePreference();
  window.setTimeout(setCloserPhoneDefaultView,500);

  const badge=document.querySelector('.header-meta .pill');
  if(badge)badge.textContent='Ireland v0.4.5';
  if(typeof IRELAND_NETWORK!=='undefined')IRELAND_NETWORK.version='Ireland v0.4.5';
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activateMobileUIV045,{once:true});
else activateMobileUIV045();
