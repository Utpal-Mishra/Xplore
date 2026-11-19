const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../learning-core.js');

test('analytics sanitizer strips raw location and address-like fields',()=>{
  const event=core.sanitizeEvent('journey_test',{
    mode:'walking',
    latitude:51.9,
    longitude:-8.4,
    address:'1 Example Street',
    eircode:'P31 XXXX',
    destination_name:'Secret Place',
    nested:{lat:1,lon:2,safe:'ok'},
    score:82
  },123);
  assert.equal(event.event,'journey_test');
  assert.equal(event.ts,123);
  assert.equal(event.payload.mode,'walking');
  assert.equal(event.payload.score,82);
  assert.equal(event.payload.latitude,undefined);
  assert.equal(event.payload.longitude,undefined);
  assert.equal(event.payload.address,undefined);
  assert.equal(event.payload.eircode,undefined);
  assert.equal(event.payload.destination_name,undefined);
  assert.deepEqual(event.payload.nested,{safe:'ok'});
});

test('journey snapshots are coarse rather than location-identifying',()=>{
  const snapshot=core.compactJourneySnapshot({
    mode:'driving',preference:'Balanced',candidateCount:3,selectedRank:1,
    score:84,distanceM:18750,durationS:2450,confidence:87,transfers:0,
    routeIntelligenceConfidence:'High'
  });
  assert.deepEqual(snapshot,{
    mode:'driving',
    preference:'Balanced',
    candidate_count:3,
    selected_rank:1,
    score_band:'80-89',
    distance_bucket:'5-20km',
    duration_bucket:'30-60m',
    confidence_band:'80-89',
    transfers:0,
    route_intelligence_confidence:'High'
  });
});

test('anonymous feedback sharing excludes free text and device identifiers',()=>{
  const shared=core.compactFeedbackForSharing({
    rating:'poor',
    destinationCorrect:'no',
    recommendOverFastest:'unsure',
    issues:['wrong_destination','route_quality','INVALID SPACE'],
    note:'This should never be shared',
    session:'private-session',
    journey:{mode:'transit',preference:'Greenest',candidateCount:4,selectedRank:0,score:76,durationS:3900,transfers:1}
  });
  assert.equal(shared.rating,'poor');
  assert.equal(shared.destination_correct,'no');
  assert.equal(shared.recommend_over_fastest,'unsure');
  assert.deepEqual(shared.issues,['wrong_destination','route_quality']);
  assert.equal(shared.note,undefined);
  assert.equal(shared.session,undefined);
  assert.equal(shared.journey.mode,'transit');
  assert.equal(shared.journey.duration_bucket,'1-2h');
});

test('retention removes old records and caps event volume',()=>{
  const now=Date.UTC(2026,10,19);
  const recent=Array.from({length:450},(_,i)=>({ts:now-i*1000,id:i}));
  recent.push({ts:now-31*86400000,id:'old'});
  const kept=core.retainRecent(recent,now,30,400);
  assert.equal(kept.length,400);
  assert.equal(kept.some(x=>x.id==='old'),false);
});

test('bucket boundaries remain stable for analytics reporting',()=>{
  assert.equal(core.distanceBucket(999),'<1km');
  assert.equal(core.distanceBucket(1000),'1-5km');
  assert.equal(core.distanceBucket(20000),'20-50km');
  assert.equal(core.durationBucket(899),'<15m');
  assert.equal(core.durationBucket(3600),'1-2h');
  assert.equal(core.scoreBand(90),'90+');
});
