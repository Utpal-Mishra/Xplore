// XPLORE v0.7.0 — precision patch for Transit v1.
// Keeps scheduled planning intact while adding strict realtime compatibility and live ranking.
(function(){
  'use strict';

  const baseLoadTransitData=loadTransitData;
  loadTransitData=async function(){
    const result=await baseLoadTransitData();
    if(xploreTransitState.realtimeEligible instanceof Set)return result;
    try{
      const stamp=encodeURIComponent(xploreTransitState.manifest?.generatedAt||localServiceDate());
      const payload=await fetch(XPLORE_TRANSIT_DATA_ROOT+'/realtime_eligible.json?v='+stamp).then(function(r){
        return r.ok?r.json():{tripIds:[]};
      });
      xploreTransitState.realtimeEligible=new Set((payload.tripIds||[]).map(String));
    }catch(error){
      console.warn('Realtime compatibility index unavailable; live updates disabled for safety.',error);
      xploreTransitState.realtimeEligible=new Set();
    }
    return result;
  };

  const baseTripObject=tripObject;
  tripObject=function(index){
    const result=baseTripObject(index);
    if(!result)return result;
    const row=xploreTransitState.trips?.[index]||[];
    result.routeId=row[6]||'';
    return result;
  };

  const baseBuildTransitLeg=buildTransitLeg;
  buildTransitLeg=function(trip,fromPos,toPos){
    const leg=baseBuildTransitLeg(trip,fromPos,toPos);
    leg.routeId=trip.routeId||'';
    return leg;
  };

  const baseTransitReasons=transitReasons;
  transitReasons=function(item,index){
    let reasons=baseTransitReasons(item,index);
    if(item.realtime?.coverage){
      reasons=reasons.filter(function(reason){return reason!=='Strong scheduled-journey confidence';});
      if(typeof transitRealtimeReasons==='function')reasons=[].concat(transitRealtimeReasons(item),reasons);
    }
    return Array.from(new Set(reasons)).slice(0,5);
  };

  renderTransitItineraries=function(items){
    xploreTransitState.itineraries=items;
    xploreTransitState.active=0;
    if(!items.length){
      $('routeList').innerHTML='<div class="notice">No same-day direct or one-transfer public-transport itinerary was found from nearby stops. Try a nearby station/stop or another travel mode.</div>';
      return;
    }
    $('routeList').innerHTML=items.map(function(item,index){
      const legs=item.legs.map(function(leg){
        return '<span>'+escapeAddressHtml(legLabel(leg))+'</span>';
      }).join('');
      const rt=item.realtime;
      const duration=rt?.usable?rt.liveDuration:item.duration;
      const departure=rt?.usable&&Number.isFinite(rt.liveDeparture)?rt.liveDeparture:item.departure;
      const arrival=rt?.usable&&Number.isFinite(rt.liveArrival)?rt.liveArrival:item.arrival;
      const liveClass=rt?.cancelled?'error':rt?.coverage?'live':'scheduled';
      const liveLabel=rt?.cancelled?'Cancelled':rt?.coverage>=1?'Live':rt?.coverage>0?'Part-live':'Scheduled';
      return '<button type="button" class="route-option transit-route-option '+(index===0?'active':'')+'" data-transit-route="'+index+'">'+
        '<div class="route-option-top"><h3>'+(index===0?'XPLORE Transit Recommended':'Transit Alternative')+
        ' <span class="transit-live-badge '+liveClass+'">'+liveLabel+'</span></h3><span class="mini-score">'+item.score+'/100</span></div>'+
        '<div class="meta">'+transitDuration(duration)+' · '+transitClock(departure)+' → '+transitClock(arrival)+' · '+item.transfers+' transfer'+(item.transfers===1?'':'s')+'</div>'+
        '<div class="transit-leg-chips">'+legs+'</div></button>';
    }).join('');
    document.querySelectorAll('[data-transit-route]').forEach(function(el){
      el.addEventListener('click',function(){selectTransitItinerary(+el.dataset.transitRoute);});
    });
    selectTransitItinerary(0);
  };

  const baseRenderTransitScore=renderTransitScore;
  renderTransitScore=function(item,index){
    baseRenderTransitScore(item,index);
    const rt=item.realtime;
    if(rt?.usable){
      const shownDuration=rt.liveDuration;
      const shownDeparture=Number.isFinite(rt.liveDeparture)?rt.liveDeparture:item.departure;
      const shownArrival=Number.isFinite(rt.liveArrival)?rt.liveArrival:item.arrival;
      $('summaryMeta').textContent=transitDuration(shownDuration)+' · '+transitClock(shownDeparture)+' → '+transitClock(shownArrival);
    }
    $('xploreWhy').textContent=rt?.coverage
      ?'Transit scoring combines door-to-door time, indicative carbon, active walking, transfer comfort and live-mobility reliability. Fresh exact-match NTA updates can change timing, connection risk and reliability; stale or unmatched live data falls back to schedule.'
      :'Transit scoring is using scheduled reliability for this option because no fresh exact-match NTA realtime update is being applied.';
    const labels={time:'Door-to-door time',carbon:'Indicative carbon',health:'Health / activity',comfort:'Transfer comfort',reliability:rt?.coverage?'Live reliability':'Schedule confidence'};
    $('scoreBreakdown').innerHTML=Object.entries(labels).map(function(entry){
      const key=entry[0],label=entry[1];
      return '<div class="breakdown-item"><span>'+label+'</span><strong>'+Math.round(item.components[key])+'/100</strong><small>'+Math.round(item.weights[key]*100)+'% weight</small></div>';
    }).join('');
  };

  const baseSelectTransitItinerary=selectTransitItinerary;
  selectTransitItinerary=async function(index){
    const result=await baseSelectTransitItinerary(index);
    const item=xploreTransitState.itineraries[index];
    if(item&&typeof renderTransitRealtimeSelection==='function')renderTransitRealtimeSelection(item);
    return result;
  };

  planTransitJourney=async function(start,destination){
    document.body.classList.add('loading');
    try{
      await loadTransitData();
      const manifest=xploreTransitState.manifest;
      if(manifest.serviceDate!==localServiceDate())transitStatus('Schedule date '+manifest.serviceDate+' differs from today · results are indicative','warning');
      setStatus('Finding nearby bus/train stops and today’s scheduled connections…');
      const originStops=nearestTransitStops(start,10,4.5);
      const destinationStops=nearestTransitStops(destination,10,4.5);
      if(!originStops.length||!destinationStops.length)throw new Error('No mapped NTA transit stops were found close enough to one of these locations.');
      const nowSec=localServiceSeconds();
      const candidates=[].concat(
        directTransitItineraries(originStops,destinationStops,nowSec),
        oneTransferItineraries(originStops,destinationStops,nowSec)
      );
      let itineraries=dedupeAndRankItineraries(candidates);
      if(typeof enrichTransitItinerariesWithRealtime==='function'&&itineraries.length){
        setStatus('Checking fresh NTA live timing, vehicle and disruption data…');
        itineraries=await enrichTransitItinerariesWithRealtime(itineraries);
      }
      xploreTransitState.lastStart=start;
      xploreTransitState.lastDestination=destination;
      state.lastDestination=destination;
      state.routes=[];
      state.enrichedRoutes=[];
      const ctx=await fetchContext(start,destination).catch(function(){return {weather:null,air:null,retrievedAt:new Date()};});
      renderContext(ctx);
      renderTransitItineraries(itineraries);
      if(!itineraries.length){
        setStatus('No same-day direct or one-transfer transit itinerary found.',true);
        return;
      }
      const liveCount=itineraries.filter(function(item){return item.realtime?.coverage>0;}).length;
      setStatus(liveCount
        ?'Found '+itineraries.length+' public-transport option'+(itineraries.length===1?'':'s')+' · fresh live data matched '+liveCount+' option'+(liveCount===1?'':'s')+'.'
        :'Found '+itineraries.length+' scheduled public-transport option'+(itineraries.length===1?'':'s')+' · no exact fresh realtime match was available.'
      );
    }finally{
      document.body.classList.remove('loading');
    }
  };

  globalThis.XPLORE_TRANSIT_VERSION='0.7.0';
})();
