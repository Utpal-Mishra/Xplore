// XPLORE Ireland v0.4.0 — sampled Route Segment Intelligence.
//
// This module analyses the selected route against nearby OpenStreetMap tags.
// Results are deliberately labelled as sampled/indicative and DO NOT change the
// XPLORE Score yet. We first need real-world validation of the matching quality.

const routeIntelligenceState={
  requestId:0,
  cache:new Map(),
  analysis:null,
  layer:null,
  lastRequestStartedAt:0,
  queue:Promise.resolve()
};

function riRouteRaw(enriched){
  return enriched?.raw||enriched||null;
}

function riRouteCoordinates(enriched){
  return riRouteRaw(enriched)?.geometry?.coordinates||[];
}

function riHaversineCoords(a,b){
  const toRad=v=>v*Math.PI/180,R=6371000;
  const lat1=toRad(a[1]),lat2=toRad(b[1]);
  const dLat=lat2-lat1,dLon=toRad(b[0]-a[0]);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}

function riRouteSampleCount(enriched){
  const km=(riRouteRaw(enriched)?.distance||0)/1000;
  if(km<=5)return 12;
  if(km<=20)return 11;
  if(km<=50)return 10;
  return 8;
}

function riSampleRoute(enriched){
  const coords=riRouteCoordinates(enriched);
  if(coords.length<2)return coords.map(c=>({lat:c[1],lon:c[0]}));

  const cumulative=[0];
  for(let i=1;i<coords.length;i++)cumulative.push(cumulative[i-1]+riHaversineCoords(coords[i-1],coords[i]));
  const total=cumulative[cumulative.length-1];
  if(!total)return [{lat:coords[0][1],lon:coords[0][0]}];

  const count=Math.min(riRouteSampleCount(enriched),Math.max(2,coords.length));
  const samples=[];
  for(let n=0;n<count;n++){
    const target=total*(n/(count-1));
    let i=1;
    while(i<cumulative.length&&cumulative[i]<target)i++;
    i=Math.min(i,cumulative.length-1);
    const prev=Math.max(0,i-1);
    const span=Math.max(1,cumulative[i]-cumulative[prev]);
    const t=Math.max(0,Math.min(1,(target-cumulative[prev])/span));
    const lon=coords[prev][0]+(coords[i][0]-coords[prev][0])*t;
    const lat=coords[prev][1]+(coords[i][1]-coords[prev][1])*t;
    samples.push({lat,lon});
  }
  return samples;
}

function riRouteKey(enriched){
  const raw=riRouteRaw(enriched),coords=riRouteCoordinates(enriched);
  const first=coords[0]||[],last=coords[coords.length-1]||[];
  return [state.mode,Math.round(raw?.distance||0),Math.round(raw?.duration||0),
    first[0]?.toFixed?.(4),first[1]?.toFixed?.(4),last[0]?.toFixed?.(4),last[1]?.toFixed?.(4)].join(':');
}

function riAround(samples,selector,radius,type='way'){
  return samples.map(p=>`${type}${selector}(around:${radius},${p.lat.toFixed(5)},${p.lon.toFixed(5)});`).join('\n');
}

function riBuildOverpassQuery(samples){
  return `[out:json][timeout:20];
(
${riAround(samples,'["highway"]',55)}
${riAround(samples,'["leisure"~"park|garden|nature_reserve"]',95)}
${riAround(samples,'["landuse"~"grass|recreation_ground|forest"]',95)}
${riAround(samples,'["natural"~"wood|grassland"]',95)}
${riAround(samples,'["wheelchair"]',40,'nwr')}
${riAround(samples,'["kerb"]',40,'node')}
${riAround(samples,'["tactile_paving"]',40,'node')}
${riAround(samples,'["highway"="elevator"]',40,'nwr')}
);
out geom;`;
}

function riFetchOverpass(samples){
  const run=async()=>{
    const wait=Math.max(0,1400-(Date.now()-routeIntelligenceState.lastRequestStartedAt));
    if(wait)await new Promise(resolve=>window.setTimeout(resolve,wait));
    routeIntelligenceState.lastRequestStartedAt=Date.now();
    const body='data='+encodeURIComponent(riBuildOverpassQuery(samples));
    const response=await fetch(MAP_CONTEXT_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body
    });
    if(!response.ok)throw new Error('Route intelligence service unavailable');
    return response.json();
  };
  const next=routeIntelligenceState.queue.then(run,run);
  routeIntelligenceState.queue=next.catch(()=>{});
  return next;
}

function riUniqueElements(data){
  const unique=new Map();
  (data?.elements||[]).forEach(element=>unique.set(`${element.type}:${element.id}`,element));
  return [...unique.values()];
}

function riElementPoints(element){
  if(element.type==='node'&&Number.isFinite(element.lat)&&Number.isFinite(element.lon))return [[element.lon,element.lat]];
  if(Array.isArray(element.geometry))return element.geometry.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>[p.lon,p.lat]);
  return [];
}

function riProject(point,origin){
  const latRad=origin[1]*Math.PI/180;
  return {
    x:(point[0]-origin[0])*111320*Math.cos(latRad),
    y:(point[1]-origin[1])*110540
  };
}

function riPointSegmentDistance(point,a,b){
  const p=riProject(point,point),pa=riProject(a,point),pb=riProject(b,point);
  const dx=pb.x-pa.x,dy=pb.y-pa.y;
  if(dx===0&&dy===0)return Math.hypot(p.x-pa.x,p.y-pa.y);
  const t=Math.max(0,Math.min(1,((p.x-pa.x)*dx+(p.y-pa.y)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p.x-(pa.x+t*dx),p.y-(pa.y+t*dy));
}

function riPointInRing(point,ring){
  let inside=false;
  const x=point[0],y=point[1];
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    const intersects=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi);
    if(intersects)inside=!inside;
  }
  return inside;
}

function riDistanceToElement(sample,element){
  const point=[sample.lon,sample.lat],points=riElementPoints(element);
  if(!points.length)return Infinity;
  if(points.length===1)return riHaversineCoords(point,points[0]);
  if(riIsGreen(element.tags||{})&&points.length>2&&riPointInRing(point,points))return 0;
  let best=Infinity;
  for(let i=1;i<points.length;i++)best=Math.min(best,riPointSegmentDistance(point,points[i-1],points[i]));
  return best;
}

function riIsGreen(tags={}){
  return /^(park|garden|nature_reserve)$/.test(tags.leisure||'')||
    /^(grass|recreation_ground|forest)$/.test(tags.landuse||'')||
    /^(wood|grassland)$/.test(tags.natural||'');
}

function riCycleValue(tags={}){
  return [tags.cycleway,tags['cycleway:left'],tags['cycleway:right'],tags['cycleway:both']].filter(Boolean).join(';').toLowerCase();
}

function riIsCycleFriendly(tags={}){
  return tags.highway==='cycleway'||tags.bicycle==='designated'||tags.bicycle==='yes'||Boolean(riCycleValue(tags));
}

function riIsProtectedCycle(tags={}){
  const cycle=riCycleValue(tags);
  return tags.highway==='cycleway'||cycle.split(';').some(v=>v==='track'||v.includes('separate'))||
    (tags.segregated==='yes'&&riIsCycleFriendly(tags));
}

function riIsFootFriendly(tags={}){
  const footHighways=['footway','pedestrian','path','living_street'];
  const sidewalk=[tags.sidewalk,tags['sidewalk:left'],tags['sidewalk:right'],tags['sidewalk:both']].filter(Boolean).join(';').toLowerCase();
  return footHighways.includes(tags.highway)||tags.foot==='designated'||tags.foot==='yes'||
    (sidewalk&& !/(^|;)(no|none)($|;)/.test(sidewalk));
}

function riIsMajorRoad(tags={}){
  return /^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link)$/.test(tags.highway||'');
}

function riAccessPositive(tags={}){
  return tags.wheelchair==='yes'||tags.wheelchair==='designated'||tags.highway==='elevator'||
    /^(lowered|flush)$/.test(tags.kerb||'')||tags.tactile_paving==='yes';
}

function riAccessConcern(tags={}){
  return tags.wheelchair==='no'||tags.highway==='steps'||tags.kerb==='raised';
}

function riAnalyseSamples(enriched,samples,elements){
  const highways=elements.filter(e=>e.tags?.highway&&riElementPoints(e).length);
  const green=elements.filter(e=>riIsGreen(e.tags||{})&&riElementPoints(e).length);
  const access=elements.filter(e=>riAccessPositive(e.tags||{})||riAccessConcern(e.tags||{}));
  let roadMatches=0,cycleHits=0,protectedCycleHits=0,greenHits=0,footHits=0,majorHits=0,litHits=0,litKnown=0;

  samples.forEach(sample=>{
    let nearestRoad=null,nearestRoadDistance=Infinity;
    let cycle=false,protectedCycle=false,greenNear=false,foot=false;

    highways.forEach(element=>{
      const distance=riDistanceToElement(sample,element);
      if(distance<nearestRoadDistance){nearestRoadDistance=distance;nearestRoad=element;}
      if(distance<=32&&riIsCycleFriendly(element.tags||{}))cycle=true;
      if(distance<=28&&riIsProtectedCycle(element.tags||{}))protectedCycle=true;
      if(distance<=28&&riIsFootFriendly(element.tags||{}))foot=true;
    });
    green.forEach(element=>{if(!greenNear&&riDistanceToElement(sample,element)<=90)greenNear=true;});

    if(nearestRoad&&nearestRoadDistance<=45){
      roadMatches++;
      if(riIsMajorRoad(nearestRoad.tags||{}))majorHits++;
      if(nearestRoad.tags?.lit!=null){litKnown++;if(nearestRoad.tags.lit==='yes')litHits++;}
      if(riIsFootFriendly(nearestRoad.tags||{}))foot=true;
      if(riIsCycleFriendly(nearestRoad.tags||{}))cycle=true;
      if(riIsProtectedCycle(nearestRoad.tags||{}))protectedCycle=true;
    }
    if(cycle)cycleHits++;
    if(protectedCycle)protectedCycleHits++;
    if(greenNear)greenHits++;
    if(foot)footHits++;
  });

  const nearAnySample=(element,radius)=>samples.some(sample=>riDistanceToElement(sample,element)<=radius);
  const accessNear=access.filter(e=>nearAnySample(e,35));
  const positiveIds=new Set(accessNear.filter(e=>riAccessPositive(e.tags||{})).map(e=>`${e.type}:${e.id}`));
  const concernIds=new Set(accessNear.filter(e=>riAccessConcern(e.tags||{})).map(e=>`${e.type}:${e.id}`));
  const total=Math.max(1,samples.length),roadDenominator=Math.max(1,roadMatches);
  const roadMatchRate=roadMatches/total;
  const km=(riRouteRaw(enriched)?.distance||0)/1000;
  let confidence='Indicative';
  if(roadMatchRate>=.82&&km<=30&&samples.length>=10)confidence='High';
  else if(roadMatchRate>=.60)confidence='Medium';

  return {
    sampleCount:samples.length,
    routeKm:km,
    roadMatchRate,
    confidence,
    cyclePct:Math.round(cycleHits/total*100),
    protectedCyclePct:Math.round(protectedCycleHits/total*100),
    greenPct:Math.round(greenHits/total*100),
    footPct:Math.round(footHits/total*100),
    majorRoadPct:Math.round(majorHits/roadDenominator*100),
    litYesPct:litKnown?Math.round(litHits/litKnown*100):null,
    litKnownPct:Math.round(litKnown/roadDenominator*100),
    accessPositive:positiveIds.size,
    accessConcerns:concernIds.size,
    longRoute:km>50
  };
}

function riMetric(id,label,value,detail){
  const valueEl=$(id),detailEl=$(`${id}Detail`);
  if(valueEl)valueEl.textContent=value;
  if(detailEl)detailEl.textContent=detail;
}

function riResetUI(message='Run a journey to analyse the selected route.'){
  routeIntelligenceState.analysis=null;
  ['riCycle','riGreen','riFoot','riMajor','riLighting','riAccess'].forEach(id=>{
    if($(id))$(id).textContent='—';
    if($(`${id}Detail`))$(`${id}Detail`).textContent='Route pending';
  });
  if($('riConfidence'))$('riConfidence').textContent='Route pending';
  if($('riSampleMeta'))$('riSampleMeta').textContent=message;
  if($('riStatus')){$('riStatus').textContent='Not yet included in XPLORE Score';$('riStatus').dataset.tone='normal';}
}

function riRenderAnalysis(analysis){
  routeIntelligenceState.analysis=analysis;
  state.routeIntelligence=analysis;
  riMetric('riCycle','Cycling',`${analysis.cyclePct}%`,`protected/segregated signal ${analysis.protectedCyclePct}%`);
  riMetric('riGreen','Green',`${analysis.greenPct}%`,'samples within ~90 m of mapped green space');
  riMetric('riFoot','Foot',`${analysis.footPct}%`,'samples with mapped foot/sidewalk support');
  riMetric('riMajor','Major roads',`${analysis.majorRoadPct}%`,'of matched route-road samples');
  riMetric('riLighting','Lighting',analysis.litYesPct==null?'Unknown':`${analysis.litYesPct}%`,`lit tagging available for ${analysis.litKnownPct}% of matched samples`);
  riMetric('riAccess','Access',analysis.accessConcerns?`${analysis.accessConcerns} flag${analysis.accessConcerns===1?'':'s'}`:'0 flags',`${analysis.accessPositive} positive accessibility signal${analysis.accessPositive===1?'':'s'} nearby`);
  if($('riConfidence'))$('riConfidence').textContent=`${analysis.confidence} data confidence`;
  if($('riSampleMeta'))$('riSampleMeta').textContent=`${analysis.sampleCount} route samples · ${analysis.routeKm.toFixed(1)} km${analysis.longRoute?' · long-route sample':''}`;
  if($('riStatus')){
    $('riStatus').textContent='Sampled OpenStreetMap route intelligence · not yet included in XPLORE Score';
    $('riStatus').dataset.tone=analysis.confidence==='Indicative'?'warning':'normal';
  }
}

function riRenderError(message='Route intelligence temporarily unavailable.'){
  riResetUI(message);
  if($('riStatus')){$('riStatus').textContent=message;$('riStatus').dataset.tone='error';}
}

async function analyseSelectedRoute(index,enriched){
  const selected=enriched?.[index];
  if(!selected)return;
  const key=riRouteKey(selected);
  const cached=routeIntelligenceState.cache.get(key);
  if(cached){riRenderAnalysis(cached);return;}

  const requestId=++routeIntelligenceState.requestId;
  if($('riConfidence'))$('riConfidence').textContent='Analysing route…';
  if($('riSampleMeta'))$('riSampleMeta').textContent='Matching selected route to open map context…';
  if($('riStatus')){$('riStatus').textContent='Analysing route segments…';$('riStatus').dataset.tone='normal';}

  try{
    const samples=riSampleRoute(selected);
    if(samples.length<2)throw new Error('Route geometry is too short to analyse');
    const data=await riFetchOverpass(samples);
    if(requestId!==routeIntelligenceState.requestId)return;
    const analysis=riAnalyseSamples(selected,samples,riUniqueElements(data));
    routeIntelligenceState.cache.set(key,analysis);
    riRenderAnalysis(analysis);
  }catch(error){
    if(requestId!==routeIntelligenceState.requestId)return;
    console.warn('XPLORE Route Intelligence unavailable.',error);
    riRenderError('Route intelligence temporarily unavailable · routing still works normally');
  }
}

function riEnsureUI(){
  if($('routeIntelligenceCard'))return;
  const right=document.querySelector('.right');if(!right)return;
  const scoreTitle=[...right.querySelectorAll('.section-title')].find(el=>el.textContent.trim()==='Score Rationale');
  if(!scoreTitle)return;

  const title=document.createElement('h2');
  title.className='section-title';title.textContent='Route Intelligence';
  const card=document.createElement('div');
  card.id='routeIntelligenceCard';card.className='card route-intelligence-card';
  card.innerHTML=`
    <div class="ri-head">
      <div><span class="ri-kicker">Selected route</span><strong id="riConfidence">Route pending</strong></div>
      <span class="ri-badge">Open map data</span>
    </div>
    <div class="ri-grid">
      <div class="ri-metric"><span>Cycling context</span><strong id="riCycle">—</strong><small id="riCycleDetail">Route pending</small></div>
      <div class="ri-metric"><span>Green proximity</span><strong id="riGreen">—</strong><small id="riGreenDetail">Route pending</small></div>
      <div class="ri-metric"><span>Foot / sidewalk</span><strong id="riFoot">—</strong><small id="riFootDetail">Route pending</small></div>
      <div class="ri-metric"><span>Major-road exposure</span><strong id="riMajor">—</strong><small id="riMajorDetail">Route pending</small></div>
      <div class="ri-metric"><span>Lighting tags</span><strong id="riLighting">—</strong><small id="riLightingDetail">Route pending</small></div>
      <div class="ri-metric"><span>Accessibility</span><strong id="riAccess">—</strong><small id="riAccessDetail">Route pending</small></div>
    </div>
    <div class="ri-footer">
      <span id="riSampleMeta">Run a journey to analyse the selected route.</span>
      <span id="riStatus">Not yet included in XPLORE Score</span>
    </div>`;
  right.insertBefore(title,scoreTitle);
  right.insertBefore(card,scoreTitle);
}

function riLoadStyles(){
  if(document.querySelector('link[data-xplore-route-intelligence]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='route-intelligence.css?v=0.4.0';link.dataset.xploreRouteIntelligence='true';
  document.head.appendChild(link);
}

function activateRouteIntelligenceV040(){
  riLoadStyles();riEnsureUI();riResetUI();
  const badge=document.querySelector('.header-meta .pill');if(badge)badge.textContent='Ireland v0.4.0';
  if(typeof IRELAND_NETWORK!=='undefined')IRELAND_NETWORK.version='Ireland v0.4.0';

  const baseSelect=selectRoute;
  selectRoute=function(index,enriched){
    baseSelect(index,enriched);
    analyseSelectedRoute(index,enriched);
  };

  const baseDraw=drawRoutes;
  drawRoutes=function(enriched,a,b){
    routeIntelligenceState.requestId++;
    routeIntelligenceState.cache.clear();
    riResetUI('New journey · route intelligence pending.');
    return baseDraw(enriched,a,b);
  };

  if(typeof resetJourneyPresentation==='function'){
    const baseReset=resetJourneyPresentation;
    resetJourneyPresentation=function(message){
      routeIntelligenceState.requestId++;
      routeIntelligenceState.cache.clear();
      riResetUI();
      return baseReset(message);
    };
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activateRouteIntelligenceV040,{once:true});
else activateRouteIntelligenceV040();
