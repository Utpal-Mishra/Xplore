const MAP_CONTEXT_ENDPOINT='https://overpass-api.de/api/interpreter';

const contextLayerState={
  visibility:{green:true,cycle:true,accessibility:true},
  requestId:0,
  layers:{green:null,cycle:null,accessibility:null}
};

function initContextPanes(){
  const panes=[['xploreGreenPane',320],['xploreCyclePane',350],['xploreAccessibilityPane',360]];
  panes.forEach(([name,zIndex])=>{
    if(!state.map.getPane(name)){
      state.map.createPane(name);
      state.map.getPane(name).style.zIndex=String(zIndex);
    }
  });
}

function clearContextLayers(){
  Object.keys(contextLayerState.layers).forEach(key=>{
    const layer=contextLayerState.layers[key];
    if(layer&&state.map.hasLayer(layer))state.map.removeLayer(layer);
    contextLayerState.layers[key]=null;
  });
  ['Green','Cycle','Accessibility'].forEach(name=>{
    const el=document.getElementById(`layer${name}Count`);
    if(el)el.textContent='—';
  });
}

function mapContextBounds(){
  const raw=state.map.getBounds();
  const padded=raw.pad(.08);
  return [padded.getSouth().toFixed(5),padded.getWest().toFixed(5),padded.getNorth().toFixed(5),padded.getEast().toFixed(5)].join(',');
}

function buildContextQuery(bbox){
  return `[out:json][timeout:12];
(
  way["highway"="cycleway"](${bbox});
  way["cycleway"](${bbox});
  way["bicycle"="designated"](${bbox});
  way["leisure"~"park|garden|nature_reserve"](${bbox});
  way["landuse"~"grass|recreation_ground|forest"](${bbox});
  way["natural"~"wood|grassland"](${bbox});
  node["wheelchair"](${bbox});
  way["wheelchair"](${bbox});
  node["highway"="elevator"](${bbox});
);
out geom;`;
}

async function fetchMapContext(){
  const body='data='+encodeURIComponent(buildContextQuery(mapContextBounds()));
  const response=await fetch(MAP_CONTEXT_ENDPOINT,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
    body
  });
  if(!response.ok)throw new Error('OpenStreetMap context service unavailable');
  return response.json();
}

function categoriesFor(tags={}){
  const categories=[];
  if(tags.highway==='cycleway'||tags.cycleway||tags.bicycle==='designated')categories.push('cycle');
  if(/^(park|garden|nature_reserve)$/.test(tags.leisure||'')||/^(grass|recreation_ground|forest)$/.test(tags.landuse||'')||/^(wood|grassland)$/.test(tags.natural||''))categories.push('green');
  if(tags.wheelchair||tags.highway==='elevator')categories.push('accessibility');
  return categories;
}

function closeRing(coords){
  if(coords.length<3)return coords;
  const first=coords[0],last=coords[coords.length-1];
  if(first[0]!==last[0]||first[1]!==last[1])coords.push([...first]);
  return coords;
}

function overpassFeatures(data){
  const features=[];
  const seen=new Set();
  (data.elements||[]).forEach(element=>{
    const tags=element.tags||{};
    categoriesFor(tags).forEach(category=>{
      const key=`${element.type}:${element.id}:${category}`;
      if(seen.has(key))return;
      seen.add(key);
      let geometry=null;
      if(element.type==='node'&&Number.isFinite(element.lat)&&Number.isFinite(element.lon)){
        geometry={type:'Point',coordinates:[element.lon,element.lat]};
      }else if(Array.isArray(element.geometry)&&element.geometry.length>1){
        const coords=element.geometry.map(p=>[p.lon,p.lat]);
        if(category==='green'&&coords.length>=3)geometry={type:'Polygon',coordinates:[closeRing(coords)]};
        else geometry={type:'LineString',coordinates:coords};
      }
      if(!geometry)return;
      features.push({type:'Feature',geometry,properties:{category,osmType:element.type,osmId:element.id,...tags}});
    });
  });
  return {type:'FeatureCollection',features};
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function accessibilityLabel(props){
  if(props.highway==='elevator')return 'Lift / elevator';
  if(props.wheelchair)return `Wheelchair: ${props.wheelchair}`;
  return 'Accessibility feature';
}

function contextPopup(feature){
  const p=feature.properties||{};
  if(p.category==='green')return `<strong>${escapeHtml(p.name||'Green space')}</strong><br><span>OpenStreetMap context layer</span>`;
  if(p.category==='cycle')return `<strong>${escapeHtml(p.name||'Cycling infrastructure')}</strong><br><span>${escapeHtml(p.highway==='cycleway'?'Dedicated cycleway':p.cycleway?`Cycleway: ${p.cycleway}`:'Bicycle-designated route')}</span>`;
  return `<strong>${escapeHtml(p.name||accessibilityLabel(p))}</strong><br><span>${escapeHtml(accessibilityLabel(p))}</span>`;
}

function makeContextLayer(collection,category){
  const data={type:'FeatureCollection',features:collection.features.filter(f=>f.properties.category===category)};
  const pane=category==='green'?'xploreGreenPane':category==='cycle'?'xploreCyclePane':'xploreAccessibilityPane';
  return L.geoJSON(data,{
    pane,
    style:feature=>{
      if(category==='green')return {color:'#4ba66a',weight:1,opacity:.65,fillColor:'#34794e',fillOpacity:.22};
      if(category==='cycle')return {color:'#55c6d9',weight:3,opacity:.72,dashArray:'7 5'};
      return {color:'#e6bf64',weight:3,opacity:.78,dashArray:'3 5'};
    },
    pointToLayer:(feature,latlng)=>L.circleMarker(latlng,{
      pane,
      radius:5,
      color:'#f0cf7a',
      weight:2,
      fillColor:'#6f581d',
      fillOpacity:.9
    }),
    onEachFeature:(feature,layer)=>layer.bindPopup(contextPopup(feature))
  });
}

function setLayerCount(category,count){
  const suffix=category==='green'?'Green':category==='cycle'?'Cycle':'Accessibility';
  const el=document.getElementById(`layer${suffix}Count`);
  if(el)el.textContent=String(count);
}

function renderContextLayers(collection){
  ['green','cycle','accessibility'].forEach(category=>{
    const features=collection.features.filter(f=>f.properties.category===category);
    setLayerCount(category,features.length);
    const layer=makeContextLayer(collection,category);
    contextLayerState.layers[category]=layer;
    if(contextLayerState.visibility[category])layer.addTo(state.map);
  });
}

function updateLayerStatus(text,isError=false){
  const el=document.getElementById('mapLayerStatus');
  if(!el)return;
  el.textContent=text;
  el.classList.toggle('error',isError);
}

async function loadContextLayers(){
  const requestId=++contextLayerState.requestId;
  clearContextLayers();
  updateLayerStatus('Loading nearby open-data context…');
  try{
    const data=await fetchMapContext();
    if(requestId!==contextLayerState.requestId)return;
    const collection=overpassFeatures(data);
    renderContextLayers(collection);
    updateLayerStatus('Visual context only · not yet included in scoring');
  }catch(error){
    if(requestId!==contextLayerState.requestId)return;
    console.warn('XPLORE map context unavailable.',error);
    updateLayerStatus('Context layers temporarily unavailable',true);
  }
}

function applyRouteHierarchy(selectedIndex=0){
  state.layers.forEach((layer,index)=>{
    const selected=index===selectedIndex;
    layer.setStyle({
      color:selected?'#5ee394':'#9aaba3',
      weight:selected?7:4,
      opacity:selected?.96:.38,
      dashArray:selected?null:'9 8',
      lineCap:'round',
      lineJoin:'round'
    });
    if(selected&&layer.bringToFront)layer.bringToFront();
  });
}

function bindLayerControls(){
  document.querySelectorAll('.map-layer-toggle').forEach(button=>{
    button.addEventListener('click',()=>{
      const category=button.dataset.layer;
      const next=!contextLayerState.visibility[category];
      contextLayerState.visibility[category]=next;
      button.classList.toggle('active',next);
      button.setAttribute('aria-pressed',String(next));
      const layer=contextLayerState.layers[category];
      if(!layer)return;
      if(next&&!state.map.hasLayer(layer))layer.addTo(state.map);
      if(!next&&state.map.hasLayer(layer))state.map.removeLayer(layer);
      applyRouteHierarchy(state.activeRoute||0);
    });
  });
}

const baseDrawRoutes=drawRoutes;
drawRoutes=function(enriched,a,b){
  contextLayerState.requestId++;
  clearContextLayers();
  baseDrawRoutes(enriched,a,b);
  applyRouteHierarchy(0);
  loadContextLayers();
};

const baseSelectRoute=selectRoute;
selectRoute=function(index,enriched){
  baseSelectRoute(index,enriched);
  applyRouteHierarchy(index);
};

document.addEventListener('DOMContentLoaded',()=>{
  initContextPanes();
  bindLayerControls();
});
