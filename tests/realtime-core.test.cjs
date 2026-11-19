const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../realtime-core.js');

test('freshness accepts recent snapshots and rejects stale ones',()=>{
  assert.deepEqual(core.freshness(60),{state:'live',usable:true,penalty:0});
  assert.deepEqual(core.freshness(600),{state:'aging',usable:true,penalty:8});
  assert.equal(core.freshness(721).usable,false);
  assert.equal(core.freshness(null).state,'unknown');
});

test('stop delays prefer the requested event but safely fall back',()=>{
  assert.equal(core.stopDelay([120,180,'SCHEDULED'],'departure'),180);
  assert.equal(core.stopDelay([120,null,'SCHEDULED'],'departure'),120);
  assert.equal(core.stopDelay([120,180,'SCHEDULED'],'arrival'),120);
  assert.equal(core.stopDelay(null,'arrival'),null);
});

test('connection gaps incorporate live delay on both legs',()=>{
  const gap=core.transferGapSeconds(
    10*3600,600,
    10*3600+900,0
  );
  assert.equal(gap,300);
  const missed=core.transferGapSeconds(
    10*3600,1200,
    10*3600+900,0
  );
  assert.equal(missed,-300);
});

test('reliability heavily penalises cancellations and missed transfers',()=>{
  const healthy=core.reliabilityScore({coverage:1,vehicleCoverage:1,maxDelaySec:120,minTransferGapSec:600,freshnessPenalty:0});
  const missed=core.reliabilityScore({coverage:1,vehicleCoverage:1,maxDelaySec:120,minTransferGapSec:-60,freshnessPenalty:0});
  const cancelled=core.reliabilityScore({coverage:1,cancelled:true});
  assert.ok(healthy>90);
  assert.ok(missed<healthy-30);
  assert.equal(cancelled,12);
});

test('route alert matching is exact on trip route or stop identifiers',()=>{
  const legs=[{tripId:'T1',routeId:'R1',boardStopId:'S1',alightStopId:'S2'}];
  assert.equal(core.routeAlertMatches({tripIds:['T1'],routeIds:[],stopIds:[]},legs),true);
  assert.equal(core.routeAlertMatches({tripIds:[],routeIds:['R1'],stopIds:[]},legs),true);
  assert.equal(core.routeAlertMatches({tripIds:[],routeIds:[],stopIds:['S2']},legs),true);
  assert.equal(core.routeAlertMatches({tripIds:['T9'],routeIds:['R9'],stopIds:['S9']},legs),false);
});

test('severe alert effects are distinguished from informational effects',()=>{
  assert.equal(core.alertSeverity('NO_SERVICE'),'severe');
  assert.equal(core.alertSeverity('SIGNIFICANT_DELAYS'),'severe');
  assert.equal(core.alertSeverity('DETOUR'),'warning');
  assert.equal(core.alertSeverity('UNKNOWN_EFFECT'),'info');
});

test('delay labels do not overstate sub-minute variation',()=>{
  assert.equal(core.formatDelay(20),'On time');
  assert.equal(core.formatDelay(360),'6 min late');
  assert.equal(core.formatDelay(-180),'3 min early');
});
