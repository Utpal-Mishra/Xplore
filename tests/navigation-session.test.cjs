const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../navigation-session.js'),'utf8');
function setup(saved){
  const elements=new Map(),events={},store=new Map(),calls={watch:[],fix:[],clear:[],draw:0,reroute:0,resize:0,pan:0};
  if(saved)store.set('xplore-navigation-session-v1',JSON.stringify(saved));
  function element(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:false,style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){}});return elements.get(id);}
  const route={raw:{geometry:{coordinates:[[-8.47,51.89],[-8.46,51.90]]},distance:1500,duration:1200}};
  const ctx={console,Date,JSON,Number,Math,setInterval(){},requestAnimationFrame(fn){fn();},
    sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    document:{visibilityState:'visible',querySelectorAll:()=>[],addEventListener:(k,v)=>events[k]=v},
    window:{addEventListener:(k,v)=>events[k]=v},
    navigator:{geolocation:{watchPosition:(ok,err)=>{calls.watch.push({ok,err});return calls.watch.length;},getCurrentPosition:(ok,err)=>calls.fix.push({ok,err}),clearWatch:id=>calls.clear.push(id)}},
    $:element,state:{map:{getCenter:()=>({lat:51.89,lng:-8.47}),getZoom:()=>17,setView(){},invalidateSize(){calls.resize++;}},liveTracking:true,livePosition:{lat:51.89,lon:-8.47,timestamp:Date.now()-60000},mode:'walking',preference:'Balanced',routes:[route],enrichedRoutes:[route],activeRoute:0,lastDestination:{lat:51.9,lon:-8.46},watchId:10},
    navigationState:{active:true,voice:false},nativeNavigationMapState:{follow:false,map:null},
    activeNavigationRoute:()=>ctx.state.enrichedRoutes[ctx.state.activeRoute],setStatus(){},setGuidanceStatus(t){calls.status=t;},permissionError(){},
    startGuidance:async()=>{ctx.navigationState.active=true;},stopGuidance:()=>{ctx.navigationState.active=false;},
    stopLiveTracking:()=>{ctx.state.liveTracking=false;ctx.stopGuidance();},
    handleLivePosition:p=>{ctx.state.livePosition={lat:p.coords.latitude,lon:p.coords.longitude,timestamp:p.timestamp};},
    selectRoute:i=>{ctx.state.activeRoute=i;},resetJourneyPresentation:()=>{ctx.stopGuidance();ctx.state.enrichedRoutes=[];},
    updateGuidance(){},syncNativeNavigationMap(){},showNativeNavigationViewport(){},
    refreshRouteFromLiveLocation(){calls.reroute++;},drawRoutes(){calls.draw++;},renderRoutes(){},
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,calls,store,events,element,route};
}
const position=(timestamp=Date.now())=>({timestamp,coords:{latitude:51.9,longitude:-8.46}});
test('lock saves active journey, unlock reuses map and route and gets fresh GPS',()=>{
  const {ctx,calls,store,events}=setup();
  ctx.document.visibilityState='hidden';events.visibilitychange();
  assert.ok(store.has('xplore-navigation-session-v1'));assert.equal(calls.watch.length,0);
  ctx.document.visibilityState='visible';events.visibilitychange();
  assert.equal(calls.resize,1);assert.equal(calls.watch.length,1);assert.equal(calls.fix.length,1);
  assert.equal(calls.draw,0);assert.equal(calls.reroute,0);assert.equal(ctx.navigationState.active,true);
});
test('reload restores selected route and retained fix without assuming GPS is live',()=>{
  const first=setup();first.ctx.saveJourneySession();
  const saved=JSON.parse(first.store.get('xplore-navigation-session-v1'));
  const {ctx,calls,element}=setup(saved);
  assert.equal(calls.draw,1);assert.equal(calls.watch.length,1);
  assert.equal(ctx.navigationState.active,true);assert.equal(ctx.state.mode,'walking');
  assert.match(element('navigationTrackingStatus').textContent,/Waiting for fresh GPS/);
  assert.equal(element('guidanceSpeed').textContent,'—');assert.equal(calls.reroute,0);
});
test('old and queued callbacks cannot overwrite current position or restart stopped guidance',()=>{
  const {ctx,calls,store}=setup();ctx.restartNavigationGPS();const old=calls.watch[0];
  ctx.restartNavigationGPS();const current=calls.watch[1];
  old.ok(position());assert.equal(ctx.state.livePosition.lat,51.89);
  current.ok(position(Date.now()-30000));assert.equal(ctx.state.livePosition.lat,51.89);
  current.ok(position());assert.equal(ctx.state.livePosition.lat,51.9);
  ctx.stopLiveTracking();current.ok(position());current.err({code:1});
  assert.equal(ctx.state.liveTracking,false);assert.equal(ctx.navigationState.active,false);
  assert.equal(store.has('xplore-navigation-session-v1'),false);
});
test('timeout keeps route, permission denial stops tracking and removes recovery snapshot',()=>{
  const {ctx,calls,store}=setup();ctx.saveJourneySession();ctx.restartNavigationGPS();
  calls.watch[0].err({code:3});assert.equal(ctx.navigationState.active,true);assert.ok(store.size);
  calls.watch[0].err({code:1});assert.equal(ctx.navigationState.active,false);assert.equal(store.size,0);
});
test('expired or malformed sessions are discarded',()=>{
  const first=setup();first.ctx.saveJourneySession();const saved=JSON.parse(first.store.values().next().value);
  saved.savedAt=Date.now()-13*60*60*1000;
  const expired=setup(saved);assert.equal(expired.calls.draw,0);assert.equal(expired.store.size,0);
  saved.savedAt=Date.now();saved.destination.lat=NaN;
  const malformed=setup(saved);assert.equal(malformed.calls.draw,0);assert.equal(malformed.store.size,0);
});
test('manual journey change clears recovery snapshot',()=>{
  const {ctx,store}=setup();ctx.saveJourneySession();ctx.resetJourneyPresentation();assert.equal(store.size,0);
});
test('storage failure does not stop active navigation',()=>{
  const {ctx}=setup();ctx.sessionStorage.setItem=()=>{throw Error('quota');};
  assert.doesNotThrow(()=>ctx.saveJourneySession());assert.equal(ctx.navigationState.active,true);
});

test('a recent restored fix still waits for a new GPS reading',()=>{
  const first=setup();first.ctx.state.livePosition.timestamp=Date.now();first.ctx.saveJourneySession();
  const saved=JSON.parse(first.store.values().next().value);
  const {calls,element}=setup(saved);
  assert.match(element('navigationTrackingStatus').textContent,/Waiting for fresh GPS/);
  calls.watch[0].ok(position(Date.now()+1));
  assert.match(element('navigationTrackingStatus').textContent,/GPS updating/);
});
