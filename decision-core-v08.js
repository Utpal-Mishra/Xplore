/* XPLORE v0.8.0 — Decision Intelligence core.
 * Deterministic, browser/CommonJS compatible scoring and evidence gates.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.XploreDecisionCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v)||0));

  function evidenceTier(analysis={}){
    const samples=Number(analysis.sampleCount)||0;
    const road=Number(analysis.roadMatchRate)||0;
    const km=Number(analysis.routeKm)||0;
    if(samples>=10&&road>=0.82&&km<=30)return {tier:'high',factor:1,eligible:true,reason:'Strong route-to-road matching across enough samples'};
    if(samples>=10&&road>=0.70&&km<=50)return {tier:'medium',factor:0.55,eligible:true,reason:'Usable but partial route-to-road evidence'};
    if(samples>=8&&road>=0.78&&km>50)return {tier:'medium',factor:0.45,eligible:true,reason:'Long-route sampling is usable but intentionally down-weighted'};
    return {tier:'indicative',factor:0,eligible:false,reason:'Route evidence did not meet scoring thresholds'};
  }

  function availableLighting(analysis={}){
    return (Number(analysis.litKnownPct)||0)>=50 && Number.isFinite(Number(analysis.litYesPct));
  }

  function weightedAverage(parts){
    const usable=parts.filter(p=>Number.isFinite(p.value)&&p.weight>0);
    const total=usable.reduce((s,p)=>s+p.weight,0);
    if(!total)return null;
    return usable.reduce((s,p)=>s+clamp(p.value)*p.weight,0)/total;
  }

  function routeQualityScore(analysis={},mode='driving'){
    const lowMajor=100-clamp(analysis.majorRoadPct);
    const green=clamp(analysis.greenPct);
    const foot=clamp(analysis.footPct);
    const cycle=clamp(analysis.cyclePct);
    const protectedCycle=clamp(analysis.protectedCyclePct);
    const lighting=availableLighting(analysis)?clamp(analysis.litYesPct):NaN;

    if(mode==='cycling'){
      return weightedAverage([
        {value:protectedCycle,weight:.38},
        {value:cycle,weight:.20},
        {value:green,weight:.17},
        {value:lowMajor,weight:.20},
        {value:lighting,weight:.05}
      ]);
    }
    if(mode==='walking'){
      return weightedAverage([
        {value:foot,weight:.38},
        {value:green,weight:.27},
        {value:lowMajor,weight:.25},
        {value:lighting,weight:.10}
      ]);
    }
    return weightedAverage([
      {value:lowMajor,weight:.55},
      {value:green,weight:.30},
      {value:lighting,weight:.15}
    ]);
  }

  function preferredRouteWeight(preference='Balanced'){
    if(preference==='Calmest')return .20;
    if(preference==='Healthiest')return .13;
    if(preference==='Greenest')return .08;
    return .12;
  }

  function integrateRouteIntelligence(baseScore,analysis,mode,preference){
    const evidence=evidenceTier(analysis);
    const quality=routeQualityScore(analysis,mode);
    if(!evidence.eligible||!Number.isFinite(quality)){
      return {
        score:Math.round(clamp(baseScore)),
        baseScore:Math.round(clamp(baseScore)),
        routeQuality:null,
        evidence,
        requestedWeight:preferredRouteWeight(preference),
        effectiveWeight:0,
        contribution:0
      };
    }
    const requestedWeight=preferredRouteWeight(preference);
    const effectiveWeight=Math.round(requestedWeight*evidence.factor*10000)/10000;
    const blended=clamp(baseScore)*(1-effectiveWeight)+quality*effectiveWeight;
    return {
      score:Math.round(blended),
      baseScore:Math.round(clamp(baseScore)),
      routeQuality:Math.round(quality),
      evidence,
      requestedWeight,
      effectiveWeight,
      contribution:Math.round((quality-clamp(baseScore))*effectiveWeight*10)/10
    };
  }

  function scoreDeltaLabel(result){
    if(!result||!result.effectiveWeight)return 'No score influence';
    const delta=result.score-result.baseScore;
    if(delta>0)return '+'+delta+' pts';
    if(delta<0)return delta+' pts';
    return '0 pts';
  }

  function scoreReason(result,mode){
    if(!result?.evidence?.eligible)return result?.evidence?.reason||'Route Intelligence excluded from score';
    const label=result.evidence.tier==='high'?'High-evidence':'Medium-evidence';
    const context=mode==='cycling'?'cycling context':mode==='walking'?'walking context':'route environment';
    return label+' '+context+' · '+scoreDeltaLabel(result);
  }

  return {
    evidenceTier,
    availableLighting,
    routeQualityScore,
    preferredRouteWeight,
    integrateRouteIntelligence,
    scoreDeltaLabel,
    scoreReason
  };
});
