const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

const multimodal=read('multimodal-v09.js');
const loader=read('eircode-provider.js');
const builder=read('scripts/build_transit_data.py');
const bootstrap=read('transit-bootstrap.js');

test('v0.9 supports bounded planning up to two transfers',()=>{
  assert.ok(multimodal.includes('boundedMultimodalItineraries'));
  assert.ok(multimodal.includes('maxTransfers=2'));
  assert.ok(multimodal.includes('nearbyTransferStops'));
  assert.ok(multimodal.includes('transferBufferSeconds'));
  assert.ok(multimodal.includes('boundedMultimodalItineraries(originStops,destinationStops,nowSec,2)'));
});

test('v0.9 loads exact GTFS shape shards lazily and falls back safely',()=>{
  assert.ok(builder.includes('shapes.txt'));
  assert.ok(builder.includes('shape_id'));
  assert.ok(builder.includes('write_shape_shards'));
  assert.ok(multimodal.includes("'/shapes/'"));
  assert.ok(multimodal.includes('shapeSegment'));
  assert.ok(multimodal.includes('Scheduled stop-sequence geometry fallback'));
});

test('fare evidence is explicitly not a scoring component',()=>{
  assert.ok(multimodal.includes('Fare not included in XPLORE Score'));
  assert.ok(bootstrap.includes('Fare evidence'));
  assert.ok(bootstrap.includes('fares do not affect XPLORE Score'));
});

test('v0.9 modules load after Live Mobility and before road Decision Intelligence',()=>{
  const live=loader.indexOf("transit-live-patch-v07.js?v=0.7.0");
  const core=loader.indexOf("multimodal-core-v09.js?v=0.9.0");
  const mm=loader.indexOf("multimodal-v09.js?v=0.9.0");
  const route=loader.indexOf("route-intelligence.js?v=0.8.0");
  assert.ok(live>=0&&live<core&&core<mm&&mm<route);
  assert.ok(loader.includes('Ireland v1.0.0 Beta'));
});

test('builder preserves v0.7-compatible trip indexes while appending v0.9 metadata',()=>{
  assert.ok(builder.includes('route_id, shape_id, agency_id'));
  assert.ok(multimodal.includes('row[7]'));
  assert.ok(multimodal.includes('row[8]'));
});
