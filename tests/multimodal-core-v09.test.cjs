const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../multimodal-core-v09.js');

test('polyline5 decoder reproduces canonical GTFS-style coordinates',()=>{
  const encoded='_p~iF~ps|U_ulLnnqC_mqNvxq'+String.fromCharCode(96)+'@';
  const points=core.decodePolyline5(encoded);
  assert.deepEqual(points,[
    [38.5,-120.2],
    [40.7,-120.95],
    [43.252,-126.453]
  ]);
});

test('shape shard hash is deterministic and compatible with 64 shards',()=>{
  assert.equal(core.shapeShard('shape-123',64),'3f');
  assert.equal(core.shapeShard('5858_1',64),'35');
  assert.throws(()=>core.shapeShard('x',63));
});

test('shape segment selects the forward board-to-alight portion',()=>{
  const points=[[53,-6],[53.001,-6],[53.002,-6],[53.003,-6]];
  const segment=core.shapeSegment(
    points,
    {lat:53.00105,lon:-6},
    {lat:53.00295,lon:-6}
  );
  assert.ok(segment);
  assert.deepEqual(segment.points,points.slice(1,4));
  assert.ok(segment.boardSnapMeters<20);
  assert.ok(segment.alightSnapMeters<20);
});

test('shape segment rejects untrustworthy distant snapping',()=>{
  const points=[[53,-6],[53.001,-6]];
  assert.equal(core.shapeSegment(points,{lat:54,lon:-6},{lat:54.1,lon:-6}),null);
});

test('transfer buffer includes walking and never drops below two minutes',()=>{
  assert.equal(core.transferBufferSeconds(0),120);
  assert.ok(core.transferBufferSeconds(250)>240);
});

test('transfer validation rejects impossible and excessively long waits',()=>{
  const arrival=10*3600;
  assert.equal(core.validTransfer(arrival,arrival+60,0),false);
  assert.equal(core.validTransfer(arrival,arrival+180,0),true);
  assert.equal(core.validTransfer(arrival,arrival+8000,0),false);
});

test('fare evidence is reference-only for an all-Cork itinerary',()=>{
  const item={legs:[{boardStopId:'a',alightStopId:'b'}]};
  const stops={
    a:['A',51.90,-8.47,'',''],
    b:['B',51.89,-8.49,'','']
  };
  const rules={verifiedAt:'2026-11-19',regions:{cork_city:{
    label:'Cork TFI 90 Minute fare reference',adultLeap:1.7,
    youngAdultStudent:.85,childLeap:.55,eligibility:'verify',source:'official'
  }}};
  const fare=core.itineraryFareEvidence(item,stops,rules);
  assert.equal(fare.status,'reference');
  assert.equal(fare.adultLeap,1.7);
});

test('fare evidence refuses to invent a price for cross-region travel',()=>{
  const item={legs:[{boardStopId:'a',alightStopId:'b'}]};
  const stops={
    a:['Cork',51.90,-8.47,'',''],
    b:['Dublin',53.35,-6.26,'','']
  };
  const fare=core.itineraryFareEvidence(item,stops,{regions:{}});
  assert.equal(fare.status,'unavailable');
  assert.match(fare.label,/varies|lookup/i);
});
