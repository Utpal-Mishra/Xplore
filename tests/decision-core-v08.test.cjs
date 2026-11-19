const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../decision-core-v08.js');

const high={
  sampleCount:11,roadMatchRate:.91,routeKm:12,
  cyclePct:78,protectedCyclePct:62,greenPct:70,footPct:45,
  majorRoadPct:18,litYesPct:80,litKnownPct:70,
  accessPositive:3,accessConcerns:1
};

test('high evidence is eligible at full factor',()=>{
  const e=core.evidenceTier(high);
  assert.equal(e.eligible,true);
  assert.equal(e.tier,'high');
  assert.equal(e.factor,1);
});

test('medium evidence is deliberately down-weighted',()=>{
  const e=core.evidenceTier({...high,roadMatchRate:.74,routeKm:35});
  assert.equal(e.eligible,true);
  assert.equal(e.tier,'medium');
  assert.equal(e.factor,.55);
});

test('indicative evidence cannot influence score',()=>{
  const weak={...high,sampleCount:7,roadMatchRate:.54};
  const result=core.integrateRouteIntelligence(82,weak,'cycling','Balanced');
  assert.equal(result.effectiveWeight,0);
  assert.equal(result.score,82);
  assert.equal(result.routeQuality,null);
});

test('long-route evidence is usable only with reduced influence',()=>{
  const e=core.evidenceTier({...high,sampleCount:8,roadMatchRate:.82,routeKm:92});
  assert.equal(e.eligible,true);
  assert.equal(e.tier,'medium');
  assert.equal(e.factor,.45);
});

test('lighting is excluded when mapped coverage is too sparse',()=>{
  const without=core.routeQualityScore({...high,litKnownPct:20,litYesPct:100},'walking');
  const unknown=core.routeQualityScore({...high,litKnownPct:0,litYesPct:null},'walking');
  assert.equal(without,unknown);
});

test('cycling quality rewards protected cycling and lower major-road exposure',()=>{
  const good=core.routeQualityScore(high,'cycling');
  const poor=core.routeQualityScore({...high,cyclePct:20,protectedCyclePct:5,majorRoadPct:85,greenPct:15},'cycling');
  assert.ok(good>poor+35);
});

test('walking quality rewards foot support green proximity and low major-road exposure',()=>{
  const good=core.routeQualityScore({...high,footPct:90,greenPct:85,majorRoadPct:10},'walking');
  const poor=core.routeQualityScore({...high,footPct:20,greenPct:10,majorRoadPct:90},'walking');
  assert.ok(good>poor+45);
});

test('accessibility observations do not alter route quality score',()=>{
  const a=core.routeQualityScore({...high,accessPositive:0,accessConcerns:9},'walking');
  const b=core.routeQualityScore({...high,accessPositive:20,accessConcerns:0},'walking');
  assert.equal(a,b);
});

test('preference controls maximum Route Intelligence weight',()=>{
  assert.equal(core.preferredRouteWeight('Balanced'),.12);
  assert.equal(core.preferredRouteWeight('Greenest'),.08);
  assert.equal(core.preferredRouteWeight('Healthiest'),.13);
  assert.equal(core.preferredRouteWeight('Calmest'),.20);
});

test('validated route intelligence blends rather than replacing base score',()=>{
  const result=core.integrateRouteIntelligence(70,high,'cycling','Calmest');
  assert.equal(result.effectiveWeight,.20);
  assert.notEqual(result.routeQuality,70);
  assert.ok(result.score>=Math.min(70,result.routeQuality));
  assert.ok(result.score<=Math.max(70,result.routeQuality));
  assert.notEqual(result.score,result.routeQuality);
});

test('medium evidence applies only a fraction of configured weight',()=>{
  const result=core.integrateRouteIntelligence(70,{...high,roadMatchRate:.74,routeKm:35},'cycling','Calmest');
  assert.equal(result.effectiveWeight,.11);
});

test('score reason states evidence tier and influence',()=>{
  const result=core.integrateRouteIntelligence(70,high,'cycling','Balanced');
  const text=core.scoreReason(result,'cycling');
  assert.match(text,/High-evidence cycling context/);
  assert.match(text,/pts/);
});
