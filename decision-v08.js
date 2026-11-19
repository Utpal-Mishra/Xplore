// XPLORE Ireland v0.8.0 — Decision Intelligence integration.
// Route Intelligence affects road/path ranking only after explicit evidence gates pass.
(function(){
  'use strict';

  const core=globalThis.XploreDecisionCore;
  if(!core){console.error('XPLORE v0.8 Decision core unavailable.');return;}

  const baseEnrichRoutes=enrichRoutes;
  const baseReasonsFor=reasonsFor;

  function evidenceLabel(result){
    if(!result?.evidence)return 'Route evidence unavailable';
    if(!result.evidence.eligible)return 'Route evidence shown, not scored';
    return (result.evidence.tier==='high'?'High':'Medium')+'-evidence Route Intelligence';
  }

  async function enrichDecisionCandidates(routes){
    const enriched=baseEnrichRoutes(routes);
    setStatus('Validating Route Intelligence before final ranking…');

    await Promise.all(enriched.map(async route=>{
      let analysis=null;
      try{
        analysis=await globalThis.xploreAnalyseRouteIntelligence(route);
      }catch(error){
        console.warn('Route Intelligence candidate validation failed; base score retained.',error);
      }

      route.baseScore=route.score;
      route.routeIntelligence=analysis;
      route.decision=core.integrateRouteIntelligence(
        route.baseScore,
        analysis,
        state.mode,
        state.preference
      );
      route.score=route.decision.score;

      if(analysis)analysis.decisionScore=route.decision;
    }));

    enriched.sort((a,b)=>b.score-a.score||a.raw.duration-b.raw.duration);
    state.enrichedRoutes=enriched;
    return enriched;
  }

  reasonsFor=function(route,rank){
    let reasons=baseReasonsFor(route,rank);
    if(route.decision?.effectiveWeight>0){
      reasons.unshift(core.scoreReason(route.decision,state.mode));
    }else if(route.routeIntelligence){
      reasons.push('Route Intelligence evidence below scoring threshold');
    }
    return Array.from(new Set(reasons)).slice(0,5);
  };

  renderScoreRationale=function(route){
    const components=scoreComponents(route.raw,route.providerIndex);
    const weights=scoreWeights();
    const decision=route.decision;
    const routeWeight=decision?.effectiveWeight||0;
    const baseScale=1-routeWeight;

    $('healthWhy').textContent=healthReason(route);

    if(routeWeight>0){
      $('xploreWhy').textContent=
        state.preference+' mode blends the existing route dimensions with validated Route Intelligence. '+
        evidenceLabel(decision)+' contributes '+Math.round(routeWeight*100)+'% effective weight; '+
        'accessibility observations remain evidence-only and are not automatically scored.';
    }else{
      $('xploreWhy').textContent=
        state.preference+' mode uses the five established route dimensions. Route Intelligence is visible, '+
        'but this candidate did not meet the evidence threshold required to change the score.';
    }

    const labels={
      time:'Time',
      carbon:'Carbon',
      health:'Health / activity',
      comfort:'Comfort',
      confidence:'Confidence'
    };
    const rows=Object.keys(labels).map(key=>{
      const effectiveWeight=weights[key]*baseScale;
      return '<div class="breakdown-item"><span>'+labels[key]+'</span><strong>'+
        Math.round(components[key])+'/100</strong><small>'+Math.round(effectiveWeight*100)+'% effective weight</small></div>';
    });

    if(decision?.routeQuality!=null){
      rows.push('<div class="breakdown-item"><span>Route Intelligence</span><strong>'+
        decision.routeQuality+'/100</strong><small>'+
        (routeWeight>0?Math.round(routeWeight*100)+'% effective weight':'0% · evidence only')+
        '</small></div>');
    }
    $('scoreBreakdown').innerHTML=rows.join('');
  };

  routeBetween=async function(a,b,{auto=false}={}){
    const [routes,ctx]=await Promise.all([fetchRoutes(a,b),fetchContext(a,b)]);
    state.routes=routes;
    state.lastDestination=b;
    renderContext(ctx);

    const enriched=await enrichDecisionCandidates(routes);
    state.routeIntelligencePrefetched=true;
    drawRoutes(enriched,a,b);
    renderRoutes(enriched);

    if(state.liveTracking&&state.livePosition){
      state.lastRoutedLivePosition={lat:state.livePosition.lat,lon:state.livePosition.lon};
      state.lastAutoRerouteAt=Date.now();
    }

    const scored=enriched.filter(r=>r.decision?.effectiveWeight>0).length;
    const evidence=scored
      ?' · Route Intelligence influenced '+scored+' of '+enriched.length+' candidate'+(enriched.length===1?'':'s')
      :' · Route Intelligence remained evidence-only';
    setStatus(
      (auto?'Route refreshed from live position · ':'Found ')+
      routes.length+' real '+state.mode+' route option'+(routes.length===1?'':'s')+evidence+'.'
    );
  };

  const baseSelectRoute=selectRoute;
  selectRoute=function(index,enriched){
    baseSelectRoute(index,enriched);
    const route=enriched?.[index];
    if(route?.routeIntelligence&&typeof globalThis.xploreRenderRouteIntelligence==='function'){
      globalThis.xploreRenderRouteIntelligence(route.routeIntelligence);
    }
  };

  function setVersion(){
    if(typeof IRELAND_NETWORK!=='undefined')IRELAND_NETWORK.version='Ireland v0.8.0';
    const badge=document.querySelector('.header-meta .pill');
    if(badge)badge.textContent='Ireland v0.8.0';
  }

  setVersion();
})();
