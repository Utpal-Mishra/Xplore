/* XPLORE v0.6.0 — privacy-safe learning primitives.
 * Browser + CommonJS compatible so the same sanitisation rules are testable in Node.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.XploreLearningCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const BLOCKED_KEY=/(^|_)(lat|lon|lng|latitude|longitude|address|eircode|query|coordinates?|origin|destination|from|to|name|note|text|message)($|_)/i;
  const ALLOWED_SCALARS=new Set(['string','number','boolean']);

  function distanceBucket(metres){
    const m=Number(metres);
    if(!Number.isFinite(m)||m<0)return 'unknown';
    if(m<1000)return '<1km';
    if(m<5000)return '1-5km';
    if(m<20000)return '5-20km';
    if(m<50000)return '20-50km';
    return '50km+';
  }

  function durationBucket(seconds){
    const s=Number(seconds);
    if(!Number.isFinite(s)||s<0)return 'unknown';
    if(s<900)return '<15m';
    if(s<1800)return '15-30m';
    if(s<3600)return '30-60m';
    if(s<7200)return '1-2h';
    return '2h+';
  }

  function scoreBand(score){
    const n=Number(score);
    if(!Number.isFinite(n))return 'unknown';
    if(n<60)return '<60';
    if(n<70)return '60-69';
    if(n<80)return '70-79';
    if(n<90)return '80-89';
    return '90+';
  }

  function providerClass(provider){
    const value=String(provider||'').toLowerCase();
    if(value.includes('eircode'))return 'eircode';
    if(value.includes('photon')||value.includes('openstreetmap')||value.includes('osm'))return 'open_map';
    if(value.includes('saved')||value.includes('personal'))return 'saved_pin';
    if(value.includes('coordinate'))return 'coordinates';
    if(!value)return 'unknown';
    return 'other';
  }

  function safeValue(value,depth=0){
    if(value==null)return null;
    if(depth>2)return undefined;
    if(ALLOWED_SCALARS.has(typeof value)){
      if(typeof value==='string')return value.slice(0,80);
      if(typeof value==='number')return Number.isFinite(value)?value:null;
      return value;
    }
    if(Array.isArray(value))return value.slice(0,12).map(v=>safeValue(v,depth+1)).filter(v=>v!==undefined);
    if(typeof value==='object'){
      const out={};
      Object.entries(value).forEach(([key,val])=>{
        if(BLOCKED_KEY.test(key))return;
        const safe=safeValue(val,depth+1);
        if(safe!==undefined)out[key]=safe;
      });
      return out;
    }
    return undefined;
  }

  function sanitizeEvent(event,payload={},now=Date.now()){
    const safe=safeValue(payload)||{};
    return {
      event:String(event||'unknown').replace(/[^a-z0-9_.-]/gi,'_').slice(0,64),
      ts:Number.isFinite(+now)?+now:Date.now(),
      payload:safe
    };
  }

  function compactJourneySnapshot(input={}){
    return {
      mode:String(input.mode||'unknown').slice(0,24),
      preference:String(input.preference||'Balanced').slice(0,24),
      candidate_count:Number.isFinite(+input.candidateCount)?Math.max(0,Math.min(20,+input.candidateCount)):0,
      selected_rank:Number.isFinite(+input.selectedRank)?Math.max(0,Math.min(20,+input.selectedRank)):0,
      score_band:scoreBand(input.score),
      distance_bucket:distanceBucket(input.distanceM),
      duration_bucket:durationBucket(input.durationS),
      confidence_band:scoreBand(input.confidence),
      transfers:Number.isFinite(+input.transfers)?Math.max(0,Math.min(8,+input.transfers)):null,
      route_intelligence_confidence:String(input.routeIntelligenceConfidence||'unknown').slice(0,20)
    };
  }

  function normaliseJourneySnapshot(input={}){
    if(input&&typeof input==='object'&&'score_band' in input){
      return {
        mode:String(input.mode||'unknown').slice(0,24),
        preference:String(input.preference||'Balanced').slice(0,24),
        candidate_count:Number.isFinite(+input.candidate_count)?Math.max(0,Math.min(20,+input.candidate_count)):0,
        selected_rank:Number.isFinite(+input.selected_rank)?Math.max(0,Math.min(20,+input.selected_rank)):0,
        score_band:String(input.score_band||'unknown').slice(0,16),
        distance_bucket:String(input.distance_bucket||'unknown').slice(0,16),
        duration_bucket:String(input.duration_bucket||'unknown').slice(0,16),
        confidence_band:String(input.confidence_band||'unknown').slice(0,16),
        transfers:Number.isFinite(+input.transfers)?Math.max(0,Math.min(8,+input.transfers)):null,
        route_intelligence_confidence:String(input.route_intelligence_confidence||'unknown').slice(0,20)
      };
    }
    return compactJourneySnapshot(input);
  }

  function compactFeedbackForSharing(record={}){
    return {
      rating:['good','okay','poor'].includes(record.rating)?record.rating:null,
      destination_correct:['yes','no','unsure'].includes(record.destinationCorrect)?record.destinationCorrect:null,
      recommend_over_fastest:['yes','no','unsure'].includes(record.recommendOverFastest)?record.recommendOverFastest:null,
      issues:Array.isArray(record.issues)?record.issues.filter(x=>/^[a-z0-9_-]{1,40}$/i.test(String(x))).slice(0,8):[],
      journey:normaliseJourneySnapshot(record.journey||{})
    };
  }

  function retainRecent(items,now=Date.now(),days=30,max=400){
    const cutoff=now-days*86400000;
    return (Array.isArray(items)?items:[])
      .filter(item=>Number.isFinite(+item?.ts)&&+item.ts>=cutoff)
      .slice(-max);
  }

  return {distanceBucket,durationBucket,scoreBand,providerClass,sanitizeEvent,compactJourneySnapshot,normaliseJourneySnapshot,compactFeedbackForSharing,retainRecent};
});
