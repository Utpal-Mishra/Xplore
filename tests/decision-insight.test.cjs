const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=read('decision-insight.js');
const html=read('index.html');
const app=read('app.js');
const network=read('ireland-network.js');

function setup(overrides={}){
  const elements=new Map();
  function element(id){
    if(!elements.has(id)){
      elements.set(id,{
        textContent:'',hidden:false,style:{width:''},attributes:new Map(),
        setAttribute(k,v){this.attributes.set(k,v)},
        removeAttribute(k){this.attributes.delete(k)}
      });
    }
    return elements.get(id);
  }
  const rawA={duration:600,distance:2000};
  const rawB={duration:660,distance:1800};
  const a={raw:rawA,providerIndex:0,score:80,carbon:340,confidence:85};
  const b={raw:rawB,providerIndex:1,score:70,carbon:306,confidence:80};
  const state={
    mode:'driving',preference:'Balanced',
    routes:[rawA,rawB],enrichedRoutes:[a,b],
    lastContext:{weather:{precipitation:0},air:{european_aqi:16}},
    ...overrides
  };
  const window={};
  const ctx={
    window,document:{getElementById:element},state,
    scoreWeights:()=>state.preference==='Greenest'
      ? {time:.20,carbon:.42,health:.18,comfort:.10,confidence:.10}
      : {time:.38,carbon:.18,health:.16,comfort:.16,confidence:.12},
    scoreComponents:(_raw,index)=>({
      time:index===0?100:72,carbon:index===0?77:80,
      health:28,comfort:86,confidence:index===0?85:80
    })
  };
  vm.runInNewContext(source,ctx);
  return {state,window,element,a,b,rawA,rawB};
}

test('selected route explanation uses real candidate differences and weights',()=>{
  const {window,element,a,b}=setup();
  window.renderRouteDecisionInsight(a,0);
  assert.equal(element('decisionInsightBody').hidden,false);
  assert.equal(element('decisionInsightEmpty').hidden,true);
  assert.equal(element('decisionInsightScore').textContent,'80/100');
  assert.match(element('decisionInsightHeading').textContent,/recommended/i);
  assert.equal(element('decisionInsightTime').textContent,'Fastest candidate');
  assert.equal(element('decisionInsightCarbon').textContent,'+34 g vs lowest');
  assert.match(element('decisionInsightDriverLabel').textContent,/Time/);
  assert.equal(element('decisionInsightDriverWeight').textContent,'38% weight · 100/100');
  assert.equal(element('decisionInsightDriverFill').style.width,'100.0%');
  assert.match(element('decisionInsightDriverDetail').textContent,/38\.0 points/);
  assert.match(element('decisionInsightPriority').textContent,/85% confidence/);

  window.renderRouteDecisionInsight(b,1);
  assert.match(element('decisionInsightHeading').textContent,/Alternative route 1/);
  assert.equal(element('decisionInsightTime').textContent,'+1 min vs fastest');
  assert.equal(element('decisionInsightCarbon').textContent,'Lowest estimated CO₂');
  assert.equal(element('decisionInsightDriverFill').style.width,'72.0%');
  assert.equal(element('decisionInsight').attributes.get('data-selected-route'),'1');
});

test('preference-specific driver, missing weather, and one available route',()=>{
  const {window,element,state,a}=setup({preference:'Greenest',lastContext:{weather:null,air:null}});
  state.enrichedRoutes=[a];
  state.routes=[a.raw];
  window.renderRouteDecisionInsight(a,0);
  assert.match(element('decisionInsightContext').textContent,/Weather unavailable/);
  assert.match(element('decisionInsightContext').textContent,/Air quality unavailable/);
  assert.equal(element('decisionInsightDriverWeight').textContent,'42% weight · 77/100');
  assert.match(element('decisionInsightDriverLabel').textContent,/Carbon/);
  assert.equal(element('decisionInsightTime').textContent,'Only route available');
  assert.equal(element('decisionInsightCarbon').textContent,'Only route available');
});

test('clearing a journey removes stale route-specific explanation',()=>{
  const {window,element,a}=setup();
  window.renderRouteDecisionInsight(a,0);
  window.resetRouteDecisionInsight();
  assert.equal(element('decisionInsightBody').hidden,true);
  assert.equal(element('decisionInsightEmpty').hidden,false);
  assert.equal(element('decisionInsightStatus').textContent,'Awaiting route');
  assert.equal(element('decisionInsight').attributes.has('data-selected-route'),false);
  window.renderRouteDecisionInsight(null,0);
  assert.equal(element('decisionInsightBody').hidden,true);
});

test('selected routes and reset paths are wired without touching map markup',()=>{
  assert.match(html,/id="decisionInsight"/);
  assert.match(html,/decision-insight\.css\?v=20261119/);
  assert.match(html,/decision-insight\\.js\\?v=0\\.8\\.0/);
  assert.ok(html.indexOf('class="card route-form"')<html.indexOf('id="decisionInsight"'));
  assert.ok(html.indexOf('id="decisionInsight"')<html.indexOf('<section class="map-wrap">'));
  assert.doesNotMatch(html,/id="decisionMotion"/);
  assert.doesNotMatch(html,/brand-motion\.js/);
  assert.match(app,/window\.renderRouteDecisionInsight\(r,index\)/);
  assert.match(network,/window\.resetRouteDecisionInsight\(\)/);
  assert.match(app,/resetJourneyPresentation\('Travel mode changed/);
  assert.match(app,/resetJourneyPresentation\('Route preference changed/);
  assert.doesNotMatch(source,/(?:fetch\(|geolocation|localStorage|sendBeacon)/);
});
