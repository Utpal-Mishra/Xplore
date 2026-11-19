const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

const integration=read('decision-v08.js');
const routeIntelligence=read('route-intelligence.js');
const loader=read('eircode-provider.js');
const html=read('index.html');

test('v0.8 waits for Route Intelligence before final road/path ranking',()=>{
  assert.ok(integration.includes('await Promise.all(enriched.map'));
  assert.ok(integration.includes('integrateRouteIntelligence'));
  assert.ok(integration.includes('enriched.sort'));
  assert.ok(integration.includes('routeBetween=async function'));
});

test('route intelligence cache survives the prefetched v0.8 draw once',()=>{
  assert.ok(routeIntelligence.includes('state.routeIntelligencePrefetched'));
  assert.ok(routeIntelligence.includes('if(!state.routeIntelligencePrefetched)routeIntelligenceState.cache.clear()'));
  assert.ok(routeIntelligence.includes('globalThis.xploreAnalyseRouteIntelligence'));
});

test('accessibility remains evidence-only in v0.8',()=>{
  assert.ok(integration.includes('accessibility observations remain evidence-only'));
  assert.ok(read('README.md').includes('Accessibility observations remain evidence-only'));
  const core=read('decision-core-v08.js');
  assert.ok(!core.includes('accessPositive,weight'));
  assert.ok(!core.includes('accessConcerns,weight'));
});

test('v0.8 modules load after route intelligence and before final release version',()=>{
  const route=loader.indexOf("route-intelligence.js?v=0.8.0");
  const core=loader.indexOf("decision-core-v08.js?v=0.8.0");
  const decision=loader.indexOf("decision-v08.js?v=0.8.0");
  assert.ok(route>=0&&route<core&&core<decision);
  assert.ok(loader.includes("Ireland v0.9.0"));
});

test('later releases preserve the v0.8 scoring boundary',()=>{
  const docs=read('docs/V08_DECISION_INTELLIGENCE.md');
  assert.ok(html.includes('Ireland v0.9.0'));
  assert.ok(docs.includes('Route Intelligence from a display-only layer into the recommendation model'));
  assert.ok(docs.includes('Accessibility remains evidence-only in v0.8'));
  assert.ok(!html.includes('Route Intelligence remains sampled and is not yet included in the XPLORE Score'));
});
