const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../beta-core-v10.js');

test('tester profile strips identity-shaped and unsupported fields by construction',()=>{
  const safe=core.safeTesterProfile({
    testerId:'FT-ABC123',
    createdAt:123,
    deviceClass:'android',
    focus:['search','navigation','unknown','search'],
    betaConsent:true,
    localAnalytics:false,
    name:'Person',
    email:'person@example.com',
    address:'Secret'
  });
  assert.deepEqual(Object.keys(safe),['schema','testerId','createdAt','deviceClass','focus','betaConsent','localAnalytics']);
  assert.deepEqual(safe.focus,['search','navigation']);
  assert.equal(safe.betaConsent,true);
});

test('Founding Tester eligibility requires consent focus and pseudonymous ID',()=>{
  assert.equal(core.testerEligible({testerId:'FT-1',focus:['search'],betaConsent:true}),true);
  assert.equal(core.testerEligible({testerId:'FT-1',focus:[],betaConsent:true}),false);
  assert.equal(core.testerEligible({testerId:'',focus:['search'],betaConsent:true}),false);
  assert.equal(core.testerEligible({testerId:'FT-1',focus:['search'],betaConsent:false}),false);
});

test('transit freshness age is deterministic',()=>{
  const now=Date.parse('2026-11-19T12:00:00Z');
  assert.equal(core.serviceDateAgeDays('2026-11-19',now),0);
  assert.equal(core.serviceDateAgeDays('2026-11-18',now),1);
  assert.equal(core.serviceDateAgeDays('bad',now),Infinity);
});

test('beta readiness fails critical controls and warns on stale transit without hiding it',()=>{
  const pass=core.betaReadiness({release:'1.0.0',https:true,transitAvailable:true,transitAgeDays:0,shapeCount:10,privacyControls:true,monitoringConfigured:true});
  assert.equal(pass.status,'pass');
  const warning=core.betaReadiness({release:'1.0.0',https:true,transitAvailable:true,transitAgeDays:3,shapeCount:0,privacyControls:true,monitoringConfigured:true});
  assert.equal(warning.status,'warning');
  const fail=core.betaReadiness({release:'1.0.0',https:false,transitAvailable:true,transitAgeDays:0,shapeCount:10,privacyControls:false,monitoringConfigured:true});
  assert.equal(fail.status,'fail');
});

test('monitor record accepts system state but not arbitrary user fields',()=>{
  const record=core.sanitiseMonitorRecord({
    release:'1.0.0',checkedAt:'2026-11-19T20:00:00Z',homepage:true,
    transitManifest:true,transitFresh:true,shapeShard:true,realtimeStatus:'unconfigured',
    lat:53.3,address:'private'
  });
  assert.equal(record.realtimeStatus,'unconfigured');
  assert.equal('lat' in record,false);
  assert.equal('address' in record,false);
});

test('tester pack is explicit user export and keeps the sanitised tester profile',()=>{
  const pack=core.testerPack(
    {testerId:'FT-X1',focus:['privacy'],betaConsent:true,deviceClass:'desktop'},
    {events:[{event:'x'}],feedback:[]},
    '2026-11-19T20:00:00Z'
  );
  assert.equal(pack.tester.testerId,'FT-X1');
  assert.equal(pack.learning.events.length,1);
  assert.match(pack.privacy,/review before sharing/i);
});
