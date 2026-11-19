/* XPLORE v0.7.0 — Live Mobility scoring primitives.
 * Browser + CommonJS compatible for deterministic regression testing.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.XploreRealtimeCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function finite(value){
    if(value==null||value==='')return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }

  function freshness(ageSeconds){
    const age=finite(ageSeconds);
    if(age==null||age<0)return {state:'unknown',usable:false,penalty:18};
    if(age<=420)return {state:'live',usable:true,penalty:0};
    if(age<=720)return {state:'aging',usable:true,penalty:8};
    return {state:'stale',usable:false,penalty:25};
  }

  function stopDelay(stopUpdate,kind){
    if(!Array.isArray(stopUpdate))return null;
    const arrival=finite(stopUpdate[0]),departure=finite(stopUpdate[1]);
    if(kind==='departure')return departure??arrival;
    return arrival??departure;
  }

  function relationshipCancelled(value){
    const text=String(value||'').toUpperCase();
    return text==='CANCELED'||text==='CANCELLED'||text==='DELETED'||text==='SKIPPED';
  }

  function effectiveServiceSeconds(scheduled,delay){
    const s=finite(scheduled),d=finite(delay);
    if(s==null)return null;
    return Math.max(0,s+(d??0));
  }

  function transferGapSeconds(firstArrival,firstDelay,nextDeparture,nextDelay){
    const a=effectiveServiceSeconds(firstArrival,firstDelay);
    const d=effectiveServiceSeconds(nextDeparture,nextDelay);
    if(a==null||d==null)return null;
    return d-a;
  }

  function reliabilityScore(input={}){
    const coverage=Math.max(0,Math.min(1,finite(input.coverage)??0));
    const vehicleCoverage=Math.max(0,Math.min(1,finite(input.vehicleCoverage)??0));
    const delay=Math.abs(finite(input.maxDelaySec)??0);
    const gap=finite(input.minTransferGapSec);
    const freshnessPenalty=Math.max(0,finite(input.freshnessPenalty)??0);
    if(input.cancelled)return 12;

    let score=coverage>=.999?96:coverage>=.5?84:68;
    score+=Math.round(vehicleCoverage*3);
    score-=Math.min(32,Math.round(delay/60*1.25));
    score-=freshnessPenalty;
    if(gap!=null&&gap<0)score-=42;
    else if(gap!=null&&gap<120)score-=28;
    else if(gap!=null&&gap<240)score-=12;
    if(input.alertSeverity==='severe')score-=24;
    else if(input.alertSeverity==='warning')score-=10;
    return Math.max(10,Math.min(99,Math.round(score)));
  }

  function alertSeverity(effect){
    const value=String(effect||'').toUpperCase();
    if(/NO_SERVICE|STOP_MOVED|SIGNIFICANT_DELAYS/.test(value))return 'severe';
    if(/REDUCED_SERVICE|DETOUR|MODIFIED_SERVICE|ADDITIONAL_SERVICE/.test(value))return 'warning';
    return 'info';
  }

  function routeAlertMatches(alert,legs=[]){
    if(!alert||!Array.isArray(legs)||!legs.length)return false;
    const tripIds=new Set((alert.tripIds||[]).map(String));
    const routeIds=new Set((alert.routeIds||[]).map(String));
    const stopIds=new Set((alert.stopIds||[]).map(String));
    return legs.some(leg=>
      tripIds.has(String(leg.tripId||''))||
      routeIds.has(String(leg.routeId||''))||
      stopIds.has(String(leg.boardStopId||''))||
      stopIds.has(String(leg.alightStopId||''))
    );
  }

  function formatDelay(delaySec){
    const delay=finite(delaySec);
    if(delay==null)return 'Live timing';
    const mins=Math.round(Math.abs(delay)/60);
    if(mins<1)return 'On time';
    return delay>0?mins+' min late':mins+' min early';
  }

  return {
    freshness,stopDelay,relationshipCancelled,effectiveServiceSeconds,
    transferGapSeconds,reliabilityScore,alertSeverity,routeAlertMatches,formatDelay
  };
});
