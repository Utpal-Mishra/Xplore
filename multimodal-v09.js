// XPLORE Ireland v0.9.0 — Multimodal maturity.
// Adds exact GTFS shape rendering, bounded up-to-two-transfer planning and fare evidence.
(function(){
  'use strict';

  const core=globalThis.XploreMultimodalCore;
  if(!core){console.error('XPLORE v0.9 multimodal core unavailable.');return;}

  const mm={
    loaded:false,
    loading:null,
    agencies:{},
    fareRules:null,
    grid:null,
    parents:null,
    transferCache:new Map(),
    shardCache:new Map(),
    shapeCache:new Map(),
    drawToken:0
  };
  xploreTransitState.multimodal=mm;

  const baseLoadTransitData=loadTransitData;
  loadTransitData=async function(){
    const result=await baseLoadTransitData();
    if(mm.loaded)return result;
    if(mm.loading){await mm.loading;return result;}
    mm.loading=(async()=>{
      const stamp=encodeURIComponent(xploreTransitState.manifest?.generatedAt||localServiceDate());
      const [agencies,fareRules]=await Promise.all([
        fetch(XPLORE_TRANSIT_DATA_ROOT+'/agencies.json?v='+stamp).then(r=>r.ok?r.json():{}).catch(()=>({})),
        fetch(XPLORE_TRANSIT_DATA_ROOT+'/fare_rules_v09.json?v=0.9.0').then(r=>r.ok?r.json():null).catch(()=>null)
      ]);
      mm.agencies=agencies||{};
      mm.fareRules=fareRules;
      buildTransferIndex();
      mm.loaded=true;
    })().finally(()=>{mm.loading=null;});
    await mm.loading;
    return result;
  };

  const baseTripObject=tripObject;
  tripObject=function(index){
    const trip=baseTripObject(index);
    if(!trip)return trip;
    const row=xploreTransitState.trips?.[index]||[];
    trip.shapeId=row[7]||'';
    trip.agencyId=row[8]||'';
    return trip;
  };

  const baseStopRecord=stopRecord;
  stopRecord=function(stopId){
    const stop=baseStopRecord(stopId);
    if(!stop)return stop;
    const row=xploreTransitState.stops?.[stopId]||[];
    stop.zone=row[4]||'';
    return stop;
  };

  const baseBuildTransitLeg=buildTransitLeg;
  buildTransitLeg=function(trip,fromPos,toPos){
    const leg=baseBuildTransitLeg(trip,fromPos,toPos);
    leg.shapeId=trip.shapeId||'';
    leg.agencyId=trip.agencyId||'';
    return leg;
  };

  function gridKey(lat,lon){
    return Math.floor(lat/.003)+':'+Math.floor(lon/.005);
  }

  function buildTransferIndex(){
    if(mm.grid)return;
    mm.grid=new Map();
    mm.parents=new Map();
    for(const [id,row] of Object.entries(xploreTransitState.stops||{})){
      const lat=+row[1],lon=+row[2],parent=row[3]||'';
      if(Number.isFinite(lat)&&Number.isFinite(lon)){
        const key=gridKey(lat,lon);
        if(!mm.grid.has(key))mm.grid.set(key,[]);
        mm.grid.get(key).push(id);
      }
      if(parent){
        if(!mm.parents.has(parent))mm.parents.set(parent,[]);
        mm.parents.get(parent).push(id);
      }
    }
  }

  function nearbyTransferStops(stopId){
    if(mm.transferCache.has(stopId))return mm.transferCache.get(stopId);
    const stop=stopRecord(stopId);
    if(!stop)return [{stopId,distance:0,walkSec:0}];

    const candidates=new Set([stopId]);
    const parent=stop.parent;
    if(parent)for(const id of mm.parents?.get(parent)||[])candidates.add(id);

    const baseLat=Math.floor(stop.lat/.003),baseLon=Math.floor(stop.lon/.005);
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
      const ids=mm.grid?.get((baseLat+a)+':'+(baseLon+b))||[];
      for(const id of ids)candidates.add(id);
    }

    const rows=[];
    for(const id of candidates){
      const other=stopRecord(id);if(!other)continue;
      const distance=id===stopId?0:core.distanceMeters(stop,other);
      const sameParent=Boolean(parent&&other.parent===parent);
      if(id===stopId||distance<=250||(sameParent&&distance<=450)){
        rows.push({
          stopId:id,
          distance,
          walkSec:distance/1.32,
          sameParent
        });
      }
    }
    rows.sort((a,b)=>a.distance-b.distance);
    const limited=rows.slice(0,7);
    mm.transferCache.set(stopId,limited);
    return limited;
  }

  function addLabel(map,label){
    const key=label.currentStopId;
    const list=map.get(key)||[];
    const signature=label.legs.map(x=>x.tripId).join('>');
    if(list.some(x=>x.signature===signature&&x.arrival<=label.arrival))return;
    list.push({...label,signature});
    list.sort((a,b)=>a.arrival-b.arrival||a.transferWalkSec-b.transferWalkSec);
    map.set(key,list.slice(0,2));
  }

  function flattenLabels(map){
    return [...map.values()].flat().sort((a,b)=>a.arrival-b.arrival).slice(0,300);
  }

  function pushDestinationResult(results,label,destinationMap,nowSec){
    const destination=destinationMap.get(label.currentStopId);
    if(!destination)return;
    const item=makeItinerary(label.origin,destination,label.legs,nowSec);
    item.transferWalkSec=label.transferWalkSec||0;
    item.walkingSec+=item.transferWalkSec;
    item.multimodalSearch='bounded-up-to-two-transfers';
    results.push(item);
  }

  function rideTripIntoLabels(map,results,origin,trip,fromPos,legs,transferWalkSec,destinationMap,nowSec,maxDownstream=32){
    const end=Math.min(trip.stops.length,fromPos+1+maxDownstream);
    for(let pos=fromPos+1;pos<end;pos++){
      const leg=buildTransitLeg(trip,fromPos,pos);
      if(!Number.isFinite(leg.arrival)||leg.arrival<leg.departure)continue;
      const nextLegs=legs.concat([leg]);
      const label={
        origin,
        currentStopId:leg.alightStopId,
        arrival:leg.arrival,
        legs:nextLegs,
        transferWalkSec
      };
      addLabel(map,label);
      pushDestinationResult(results,label,destinationMap,nowSec);
    }
  }

  function boundedMultimodalItineraries(originStops,destinationStops,nowSec,maxTransfers=2){
    const destinationMap=new Map(destinationStops.map(stop=>[stop.id,stop]));
    const results=[];
    let states=new Map();

    for(const origin of originStops.slice(0,8)){
      const refs=xploreTransitState.tripsByStop[origin.id]||[];
      const earliest=nowSec+origin.walkSec;
      let cursor=lowerBoundDeparture(refs,earliest);
      for(let inspected=0;cursor<refs.length&&inspected<10;cursor++,inspected++){
        const [tripIndex,pos,dep]=refs[cursor];
        if(dep>earliest+3600)break;
        const trip=tripObject(tripIndex);if(!trip)continue;
        rideTripIntoLabels(states,results,origin,trip,pos,[],0,destinationMap,nowSec,36);
      }
    }

    for(let transferRound=1;transferRound<=maxTransfers;transferRound++){
      const nextStates=new Map();
      for(const stateLabel of flattenLabels(states)){
        const used=new Set(stateLabel.legs.map(x=>x.tripId));
        for(const interchange of nearbyTransferStops(stateLabel.currentStopId)){
          const refs=xploreTransitState.tripsByStop[interchange.stopId]||[];
          const ready=stateLabel.arrival+core.transferBufferSeconds(interchange.distance);
          let cursor=lowerBoundDeparture(refs,ready);
          for(let inspected=0;cursor<refs.length&&inspected<5;cursor++,inspected++){
            const [tripIndex,pos,dep]=refs[cursor];
            if(!core.validTransfer(stateLabel.arrival,dep,interchange.distance,4500))break;
            const trip=tripObject(tripIndex);if(!trip||used.has(trip.id))continue;
            rideTripIntoLabels(
              nextStates,
              results,
              stateLabel.origin,
              trip,
              pos,
              stateLabel.legs,
              stateLabel.transferWalkSec+interchange.walkSec,
              destinationMap,
              nowSec,
              30
            );
          }
        }
      }
      states=nextStates;
      if(!states.size)break;
    }
    return results;
  }

  function attachFareEvidence(item){
    item.fareEvidence=core.itineraryFareEvidence(
      item,
      xploreTransitState.stops,
      mm.fareRules
    );
    return item;
  }

  function fareText(item){
    const fare=item?.fareEvidence;
    if(fare?.status==='reference'&&Number.isFinite(+fare.adultLeap)){
      return 'Adult Leap ref €'+Number(fare.adultLeap).toFixed(2);
    }
    return fare?.label||'Fare lookup required';
  }

  const baseTransitReasons=transitReasons;
  transitReasons=function(item,index){
    const reasons=baseTransitReasons(item,index);
    if(item.fareEvidence?.status==='reference'){
      reasons.push(fareText(item)+' · eligibility check required');
    }else{
      reasons.push('Fare not included in XPLORE Score');
    }
    if(item.transfers===2)reasons.push('Two-transfer itinerary');
    return Array.from(new Set(reasons)).slice(0,6);
  };

  const baseRenderTransitItineraries=renderTransitItineraries;
  renderTransitItineraries=function(items){
    items.forEach(attachFareEvidence);
    baseRenderTransitItineraries(items);
    document.querySelectorAll('[data-transit-route]').forEach((el,index)=>{
      const item=items[index],meta=el.querySelector('.meta');
      if(meta&&item)meta.textContent+=' · '+fareText(item);
    });
  };

  function fareSelection(item){
    const el=$('transitFareEvidence');if(!el)return;
    const fare=item?.fareEvidence;
    if(fare?.status==='reference'){
      el.textContent=fare.label+' · Adult Leap €'+Number(fare.adultLeap).toFixed(2)+' · reference only; verify eligibility';
      el.dataset.tone='warning';
    }else{
      el.textContent=(fare?.label||'Fare lookup required')+' · not used in XPLORE Score';
      el.dataset.tone='normal';
    }
  }

  const baseSelectTransitItinerary=selectTransitItinerary;
  selectTransitItinerary=async function(index){
    const result=await baseSelectTransitItinerary(index);
    const item=xploreTransitState.itineraries[index];
    if(item)fareSelection(item);
    return result;
  };

  async function loadShape(shapeId){
    if(!shapeId)return null;
    if(mm.shapeCache.has(shapeId))return mm.shapeCache.get(shapeId);
    const count=xploreTransitState.manifest?.shapeShardCount||64;
    const shard=core.shapeShard(shapeId,count);
    if(!mm.shardCache.has(shard)){
      const version=encodeURIComponent(xploreTransitState.manifest?.generatedAt||localServiceDate());
      mm.shardCache.set(shard,
        fetch(XPLORE_TRANSIT_DATA_ROOT+'/shapes/'+shard+'.json?v='+version)
          .then(r=>r.ok?r.json():{})
          .catch(()=>({}))
      );
    }
    const payload=await mm.shardCache.get(shard);
    const encoded=payload?.[shapeId]||null;
    const points=encoded?core.decodePolyline5(encoded):null;
    mm.shapeCache.set(shapeId,points);
    return points;
  }

  const baseDrawTransitItinerary=drawTransitItinerary;
  drawTransitItinerary=function(item,start,destination){
    baseDrawTransitItinerary(item,start,destination);
    const token=++mm.drawToken;
    refineTransitShapeGeometry(item,start,destination,token);
  };

  async function refineTransitShapeGeometry(item,start,destination,token){
    const legGeometry=await Promise.all(item.legs.map(async leg=>{
      const trip=tripObject(leg.tripIndex);
      if(!trip?.shapeId)return null;
      const points=await loadShape(trip.shapeId);
      const board=stopRecord(leg.boardStopId),alight=stopRecord(leg.alightStopId);
      return points&&board&&alight?core.shapeSegment(points,board,alight):null;
    }));
    if(token!==mm.drawToken)return;
    const exactCount=legGeometry.filter(Boolean).length;
    const geometryStatus=$('transitGeometryStatus');
    if(!exactCount){
      if(geometryStatus){geometryStatus.textContent='Scheduled stop-sequence geometry fallback';geometryStatus.dataset.tone='warning';}
      return;
    }

    clearMap();
    state.markers.push(L.marker([start.lat,start.lon]).addTo(state.map).bindPopup('Start: '+start.name));
    state.markers.push(L.marker([destination.lat,destination.lon]).addTo(state.map).bindPopup('Destination: '+destination.name));
    const bounds=L.latLngBounds([[start.lat,start.lon],[destination.lat,destination.lon]]);
    const firstStop=stopRecord(item.legs[0].boardStopId),lastStop=stopRecord(item.legs[item.legs.length-1].alightStopId);
    if(firstStop){
      const access=L.polyline([[start.lat,start.lon],[firstStop.lat,firstStop.lon]],{weight:3,opacity:.75,dashArray:'7 8'}).addTo(state.map);
      state.layers.push(access);bounds.extend([firstStop.lat,firstStop.lon]);
    }

    item.legs.forEach((leg,index)=>{
      const trip=tripObject(leg.tripIndex);
      let coords=legGeometry[index]?.points||null;
      if(!coords){
        coords=[];
        if(trip)for(let pos=leg.fromPos;pos<=leg.toPos;pos++){
          const stop=stopRecord(trip.stops[pos][0]);
          if(stop)coords.push([stop.lat,stop.lon]);
        }
      }
      if(coords.length>1){
        const line=L.polyline(coords,{weight:index===0?7:6,opacity:.92}).addTo(state.map);
        state.layers.push(line);
        coords.forEach(point=>bounds.extend(point));
      }
      const board=stopRecord(leg.boardStopId),alight=stopRecord(leg.alightStopId);
      if(board)state.markers.push(L.circleMarker([board.lat,board.lon],{radius:6,weight:2,fillOpacity:1}).addTo(state.map).bindTooltip(legLabel(leg)+' · board '+board.name));
      if(alight)state.markers.push(L.circleMarker([alight.lat,alight.lon],{radius:5,weight:2,fillOpacity:1}).addTo(state.map).bindTooltip('Alight · '+alight.name));
    });

    if(lastStop){
      const egress=L.polyline([[lastStop.lat,lastStop.lon],[destination.lat,destination.lon]],{weight:3,opacity:.75,dashArray:'7 8'}).addTo(state.map);
      state.layers.push(egress);
    }
    state.map.fitBounds(bounds.pad(.15));
    if(geometryStatus){
      geometryStatus.textContent=exactCount===item.legs.length
        ?'Exact GTFS source shape · all transit legs'
        :'Exact GTFS shape '+exactCount+'/'+item.legs.length+' legs · fallback elsewhere';
      geometryStatus.dataset.tone=exactCount===item.legs.length?'success':'warning';
    }
  }

  planTransitJourney=async function(start,destination){
    document.body.classList.add('loading');
    try{
      await loadTransitData();
      const manifest=xploreTransitState.manifest;
      if(manifest.serviceDate!==localServiceDate())transitStatus('Schedule date '+manifest.serviceDate+' differs from today · results are indicative','warning');
      setStatus('Searching direct journeys and bounded transfers across nearby stops…');
      const originStops=nearestTransitStops(start,10,4.5);
      const destinationStops=nearestTransitStops(destination,10,4.5);
      if(!originStops.length||!destinationStops.length)throw new Error('No mapped NTA transit stops were found close enough to one of these locations.');

      const nowSec=localServiceSeconds();
      const candidates=[].concat(
        directTransitItineraries(originStops,destinationStops,nowSec),
        boundedMultimodalItineraries(originStops,destinationStops,nowSec,2)
      );
      let itineraries=dedupeAndRankItineraries(candidates).map(attachFareEvidence);

      if(typeof enrichTransitItinerariesWithRealtime==='function'&&itineraries.length){
        setStatus('Checking fresh NTA live timing and transfer feasibility…');
        itineraries=await enrichTransitItinerariesWithRealtime(itineraries);
      }

      xploreTransitState.lastStart=start;
      xploreTransitState.lastDestination=destination;
      state.lastDestination=destination;
      state.routes=[];
      state.enrichedRoutes=[];
      const ctx=await fetchContext(start,destination).catch(()=>({weather:null,air:null,retrievedAt:new Date()}));
      renderContext(ctx);
      renderTransitItineraries(itineraries);

      if(!itineraries.length){
        setStatus('No same-day public-transport itinerary found within the bounded two-transfer search.',true);
        return;
      }
      const liveCount=itineraries.filter(item=>item.realtime?.coverage>0).length;
      const twoTransfer=itineraries.filter(item=>item.transfers===2).length;
      setStatus(
        'Found '+itineraries.length+' public-transport option'+(itineraries.length===1?'':'s')+
        ' · search supports up to two transfers'+
        (twoTransfer?' · '+twoTransfer+' two-transfer option'+(twoTransfer===1?'':'s'):'')+
        (liveCount?' · fresh live evidence on '+liveCount:'')+'.'
      );
    }finally{
      document.body.classList.remove('loading');
    }
  };

  function setVersion(){
    if(typeof IRELAND_NETWORK!=='undefined')IRELAND_NETWORK.version='Ireland v0.9.0';
    const badge=document.querySelector('.header-meta .pill');
    if(badge)badge.textContent='Ireland v0.9.0';
  }
  setVersion();

  globalThis.xploreBoundedMultimodalItineraries=boundedMultimodalItineraries;
  globalThis.xploreNearbyTransferStops=nearbyTransferStops;
  globalThis.xploreLoadTransitShape=loadShape;
})();
