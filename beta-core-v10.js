/* XPLORE v1.0.0 — beta readiness and privacy primitives.
 * Browser + CommonJS compatible.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.XploreBetaCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const FOCUS=new Set(['search','route_quality','decision_intelligence','navigation','transit','accessibility','privacy']);
  const DEVICE=new Set(['desktop','android','ios','tablet','other']);

  function safeTesterProfile(input={}){
    return {
      schema:'xplore-founding-tester-v1',
      testerId:String(input.testerId||'').replace(/[^A-Z0-9-]/gi,'').slice(0,24),
      createdAt:Number.isFinite(+input.createdAt)?+input.createdAt:Date.now(),
      deviceClass:DEVICE.has(input.deviceClass)?input.deviceClass:'other',
      focus:Array.isArray(input.focus)?[...new Set(input.focus.filter(x=>FOCUS.has(x)))].slice(0,7):[],
      betaConsent:Boolean(input.betaConsent),
      localAnalytics:Boolean(input.localAnalytics)
    };
  }

  function testerEligible(profile){
    const safe=safeTesterProfile(profile);
    return Boolean(safe.testerId&&safe.betaConsent&&safe.focus.length);
  }

  function serviceDateAgeDays(serviceDate,now=Date.now()){
    const parsed=Date.parse(String(serviceDate||'')+'T12:00:00Z');
    if(!Number.isFinite(parsed))return Infinity;
    return Math.abs(now-parsed)/86400000;
  }

  function betaReadiness(input={}){
    const checks=[
      {id:'release',ok:String(input.release||'')==='1.0.0',critical:true},
      {id:'https',ok:Boolean(input.https),critical:true},
      {id:'transit',ok:Boolean(input.transitAvailable),critical:false},
      {id:'transit_freshness',ok:Number(input.transitAgeDays)<=1.5,critical:false},
      {id:'shapes',ok:Number(input.shapeCount)>0,critical:false},
      {id:'privacy_controls',ok:Boolean(input.privacyControls),critical:true},
      {id:'monitoring',ok:Boolean(input.monitoringConfigured),critical:true}
    ];
    const criticalFailed=checks.some(x=>x.critical&&!x.ok);
    const warnings=checks.filter(x=>!x.critical&&!x.ok).length;
    return {
      status:criticalFailed?'fail':warnings?'warning':'pass',
      checks,
      criticalFailed,
      warnings
    };
  }

  function sanitiseMonitorRecord(input={}){
    return {
      release:String(input.release||'').slice(0,16),
      checkedAt:String(input.checkedAt||'').slice(0,40),
      homepage:Boolean(input.homepage),
      transitManifest:Boolean(input.transitManifest),
      transitFresh:Boolean(input.transitFresh),
      shapeShard:Boolean(input.shapeShard),
      realtimeStatus:['live','unconfigured','unavailable','stale','unknown'].includes(input.realtimeStatus)?input.realtimeStatus:'unknown'
    };
  }

  function testerPack(profile,learning,now=new Date().toISOString()){
    const safe=safeTesterProfile(profile);
    return {
      schema:'xplore-founding-tester-pack-v1',
      generatedAt:String(now),
      tester:safe,
      privacy:'User-initiated export. May contain optional feedback notes already stored locally by the user; review before sharing.',
      learning:learning&&typeof learning==='object'?learning:{events:[],feedback:[]}
    };
  }

  return {safeTesterProfile,testerEligible,serviceDateAgeDays,betaReadiness,sanitiseMonitorRecord,testerPack};
});
