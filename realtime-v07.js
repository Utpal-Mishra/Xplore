// XPLORE Ireland v0.7.0 — Live Mobility client adapter.
// Consumes a server-built NTA GTFS-Realtime snapshot. No NTA credential enters browser code.
(function(){
  'use strict';

  const core=globalThis.XploreRealtimeCore;
  if(!core){console.error('XPLORE realtime core unavailable.');return;}

  const ROOT='data/realtime';
  const CACHE_MS=60000;
  const realtimeState={
    loadedAt:0,
    manifest:null,
    feed:null,
    freshness:null,
    loading:null
  };

  function rtEl(id){return document.getElementById(id);}
  function setRealtimeRow(id,text,tone='normal'){
    const el=rtEl(id);if(!el)return;
    el.textContent=text;el.dataset.tone=tone;
  }

  function relativeAge(seconds){
    if(!Number.isFinite(seconds))return 'unknown age';
    if(seconds<60)return 'just updated';
    const mins=Math.round(seconds/60);
    return mins===1?'1 min ago':mins+' min ago';
  }

  function browserSnapshotAge(manifest){
    const generated=Date.parse(manifest?.generatedAt||'');
    if(!Number.isFinite(generated))return null;
    return Math.max(0,(Date.now()-generated)/1000);
  }

  function currentFreshness(manifest){
    const browserAge=browserSnapshotAge(manifest);
    const sourceAge=Number.isFinite(+manifest?.feedAgeSec)?+manifest.feedAgeSec:0;
    const age=browserAge==null?null:browserAge+Math.max(0,sourceAge);
    return {age,...core.freshness(age)};
  }

  async function loadRealtimeSnapshot({force=false}={}){
    if(!force&&realtimeState.manifest&&Date.now()-realtimeState.loadedAt<CACHE_MS)return realtimeState;
    if(realtimeState.loading)return realtimeState.loading;
    realtimeState.loading=(async()=>{
      try{
        const nonce=Date.now();
        const manifest=await fetch(`${ROOT}/manifest.json?v=${nonce}`,{cache:'no-store'}).then(r=>{
          if(!r.ok)throw new Error('Live mobility manifest unavailable');
          return r.json();
        });
        realtimeState.manifest=manifest;
        realtimeState.freshness=currentFreshness(manifest);
        realtimeState.loadedAt=Date.now();

        if(manifest.status!=='live'){
          realtimeState.feed=null;
          const message=manifest.status==='unconfigured'
            ?'NTA live bus/train feed awaiting server-side API key'
            :'NTA live mobility snapshot unavailable · scheduled data retained';
          setRealtimeRow('transitRealtimeStatus',message,'warning');
          setRealtimeRow('transitTripLive','Scheduled timing active','normal');
          setRealtimeRow('transitVehicleLive','Vehicle positions unavailable','normal');
          setRealtimeRow('transitAlertLive','Realtime alerts unavailable','normal');
          return realtimeState;
        }

        if(!realtimeState.freshness.usable){
          realtimeState.feed=null;
          setRealtimeRow('transitRealtimeStatus',`Realtime snapshot stale · ${relativeAge(realtimeState.freshness.age)} · scheduled fallback`,'warning');
          return realtimeState;
        }

        const feed=await fetch(`${ROOT}/feed.json?v=${encodeURIComponent(manifest.generatedAt||nonce)}`,{cache:'no-store'}).then(r=>{
          if(!r.ok)throw new Error('Live mobility feed unavailable');
          return r.json();
        });
        realtimeState.feed=feed;
        const tone=realtimeState.freshness.state==='live'?'success':'warning';
        setRealtimeRow('transitRealtimeStatus',`NTA live snapshot · ${relativeAge(realtimeState.freshness.age)}`,tone);
        return realtimeState;
      }catch(error){
        console.warn('XPLORE live mobility snapshot unavailable.',error);
        realtimeState.feed=null;
        realtimeState.manifest=null;
        realtimeState.freshness={age:null,state:'unknown',usable:false,penalty:18};
        realtimeState.loadedAt=Date.now();
        setRealtimeRow('transitRealtimeStatus','Realtime unavailable · scheduled fallback','warning');
        return realtimeState;
      }finally{
        realtimeState.loading=null;
      }
    })();
    return realtimeState.loading;
  }

  function eligibleTripSet(){
    const set=xploreTransitState?.realtimeEligible;
    return set instanceof Set?set:new Set();
  }

  function legLiveDetails(leg,feed,eligible){
    const tripId=String(leg.tripId||'');
    if(!tripId||!eligible.has(tripId))return {eligible:false,matched:false};
    const update=feed?.tripUpdates?.[tripId];
    const vehicle=feed?.vehicles?.[tripId]||null;
    if(!update)return {eligible:true,matched:false,vehicle};
    const board=update.s?.[String(leg.boardStopId)]||null;
    const alight=update.s?.[String(leg.alightStopId)]||null;
    const depDelay=core.stopDelay(board,'departure');
    const arrDelay=core.stopDelay(alight,'arrival');
    const cancelled=core.relationshipCancelled(update.rel)||
      core.relationshipCancelled(board?.[2])||core.relationshipCancelled(alight?.[2]);
    return {eligible:true,matched:true,update,vehicle,board,alight,depDelay,arrDelay,cancelled};
  }

  function matchedAlerts(item,feed){
    return (feed?.alerts||[]).filter(alert=>!alert.networkWide&&core.routeAlertMatches(alert,item.legs||[]));
  }

  function alertSeverity(alerts){
    let result='info';
    for(const alert of alerts){
      const current=core.alertSeverity(alert.effect);
      if(current==='severe')return 'severe';
      if(current==='warning')result='warning';
    }
    return result;
  }

  function enrichOne(item,feed,freshness){
    const eligible=eligibleTripSet();
    const details=(item.legs||[]).map(leg=>legLiveDetails(leg,feed,eligible));
    const matched=details.filter(x=>x.matched);
    const vehicles=details.filter(x=>x.vehicle);
    const delays=details.flatMap(x=>[x.depDelay,x.arrDelay]).filter(Number.isFinite);
    const cancelled=details.some(x=>x.cancelled);
    const alerts=matchedAlerts(item,feed);
    const severity=alertSeverity(alerts);

    let minTransferGapSec=null;
    for(let i=0;i<details.length-1;i++){
      const gap=core.transferGapSeconds(
        item.legs[i].arrival,details[i].arrDelay,
        item.legs[i+1].departure,details[i+1].depDelay
      );
      if(Number.isFinite(gap)&&(minTransferGapSec==null||gap<minTransferGapSec))minTransferGapSec=gap;
    }

    const first=details[0]||{},last=details[details.length-1]||{};
    const coverage=details.length?matched.length/details.length:0;
    const vehicleCoverage=details.length?vehicles.length/details.length:0;
    const maxDelaySec=delays.length?Math.max(...delays.map(Math.abs)):0;
    const reliability=core.reliabilityScore({
      coverage,vehicleCoverage,maxDelaySec,minTransferGapSec,cancelled,
      freshnessPenalty:freshness?.penalty||0,alertSeverity:severity
    });

    const liveDeparture=core.effectiveServiceSeconds(item.departure,first.depDelay);
    const liveArrival=core.effectiveServiceSeconds(item.arrival,last.arrDelay);
    const liveDuration=Math.max(0,item.duration+(Number.isFinite(last.arrDelay)?last.arrDelay:0));

    item.realtime={
      usable:Boolean(freshness?.usable),
      state:freshness?.state||'unknown',
      ageSec:freshness?.age??null,
      coverage,vehicleCoverage,maxDelaySec,minTransferGapSec,cancelled,
      firstDepartureDelay:first.depDelay??null,
      finalArrivalDelay:last.arrDelay??null,
      liveDeparture,liveArrival,liveDuration,
      alerts,severity,legs:details
    };
    item.reliability=reliability;
    if(item.components)item.components.reliability=reliability;
    return item;
  }

  function rescoreLive(items){
    if(!items.length)return items;
    const durations=items.map(item=>item.realtime?.usable?item.realtime.liveDuration:item.duration);
    const min=Math.min(...durations),max=Math.max(...durations);
    items.forEach((item,index)=>{
      const duration=durations[index];
      const time=max===min?100:100-((duration-min)/(max-min))*26;
      if(item.components)item.components.time=time;
      const c=item.components||{};
      const w=item.weights||{};
      let score=Math.round(
        (c.time||0)*(w.time||0)+
        (c.carbon||0)*(w.carbon||0)+
        (c.health||0)*(w.health||0)+
        (c.comfort||0)*(w.comfort||0)+
        (c.reliability||0)*(w.reliability||0)
      );
      if(item.realtime?.cancelled)score=Math.min(score,25);
      if(Number.isFinite(item.realtime?.minTransferGapSec)&&item.realtime.minTransferGapSec<0)score=Math.min(score,45);
      item.score=Math.max(1,Math.min(100,score));
    });
    return items.sort((a,b)=>b.score-a.score||
      (a.realtime?.liveDuration??a.duration)-(b.realtime?.liveDuration??b.duration));
  }

  async function enrichTransitItinerariesWithRealtime(items){
    if(!Array.isArray(items)||!items.length)return items||[];
    const snapshot=await loadRealtimeSnapshot();
    if(!snapshot.feed||!snapshot.freshness?.usable)return items;
    items.forEach(item=>enrichOne(item,snapshot.feed,snapshot.freshness));
    return rescoreLive(items);
  }

  function liveTimingLabel(item){
    const rt=item?.realtime;
    if(!rt?.usable||!rt.coverage)return 'Scheduled';
    if(rt.cancelled)return 'Cancelled';
    if(rt.coverage<1)return 'Part-live';
    return 'Live';
  }

  function itemDelayText(item){
    const delay=item?.realtime?.finalArrivalDelay;
    return core.formatDelay(delay);
  }

  function addVehicleMarkers(item){
    const legs=item?.realtime?.legs||[];
    legs.forEach((live,index)=>{
      const vehicle=live.vehicle;
      if(!Array.isArray(vehicle)||vehicle.length<3)return;
      const [lat,lon,timestamp,bearing]=vehicle;
      if(!Number.isFinite(+lat)||!Number.isFinite(+lon))return;
      const age=timestamp?Math.max(0,(Date.now()/1000)-timestamp):null;
      const marker=L.circleMarker([+lat,+lon],{
        radius:7,weight:2,fillOpacity:.95,className:'transit-live-vehicle'
      }).addTo(state.map);
      const leg=item.legs[index],label=typeof legLabel==='function'?legLabel(leg):'Transit';
      marker.bindTooltip(`Live ${label}${Number.isFinite(age)?` · ${relativeAge(age)}`:''}${Number.isFinite(+bearing)?` · heading ${Math.round(+bearing)}°`:''}`);
      state.markers.push(marker);
    });
  }

  function renderTransitRealtimeSelection(item){
    const rt=item?.realtime;
    if(!rt?.usable||!rt.coverage){
      setRealtimeRow('transitTripLive','No exact live match for this itinerary · scheduled timing retained','normal');
      setRealtimeRow('transitVehicleLive','No matched vehicle position','normal');
      setRealtimeRow('transitAlertLive','No matched route alert','normal');
      return;
    }

    const matched=Math.round(rt.coverage*(item.legs?.length||0));
    const total=item.legs?.length||0;
    const tone=rt.cancelled||rt.minTransferGapSec<0?'error':Math.abs(rt.finalArrivalDelay||0)>300?'warning':'success';
    setRealtimeRow('transitTripLive',`${liveTimingLabel(item)} timing · ${matched}/${total} legs · ${itemDelayText(item)}`,tone);

    const vehicles=Math.round(rt.vehicleCoverage*total);
    setRealtimeRow('transitVehicleLive',vehicles?`Live vehicle positions · ${vehicles}/${total} legs`:'No matched vehicle position in this snapshot',vehicles?'success':'normal');

    const alert=rt.alerts?.[0];
    setRealtimeRow('transitAlertLive',alert?(alert.header||alert.effect||'Route-specific service alert'):'No route-specific service alert in this snapshot',alert?(rt.severity==='severe'?'error':'warning'):'success');
    addVehicleMarkers(item);
  }

  function realtimeReasons(item){
    const rt=item?.realtime;
    if(!rt?.usable||!rt.coverage)return [];
    const out=[];
    if(rt.cancelled)out.push('Live feed marks a service as cancelled');
    else if(Number.isFinite(rt.minTransferGapSec)&&rt.minTransferGapSec<0)out.push('Live timing indicates a missed-connection risk');
    else if(Number.isFinite(rt.minTransferGapSec)&&rt.minTransferGapSec<240)out.push('Live timing shows a tight connection');
    else out.push(`${rt.coverage>=1?'Live':'Part-live'} service timing · ${itemDelayText(item)}`);
    if(rt.vehicleCoverage>0)out.push('Live vehicle position available');
    if(rt.alerts?.length)out.push(rt.alerts[0].header||'Route-specific service alert');
    return out.slice(0,2);
  }

  globalThis.enrichTransitItinerariesWithRealtime=enrichTransitItinerariesWithRealtime;
  globalThis.renderTransitRealtimeSelection=renderTransitRealtimeSelection;
  globalThis.transitRealtimeReasons=realtimeReasons;
  globalThis.xploreRealtimeState=realtimeState;
})();
