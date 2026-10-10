const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cork-place-search.js'),'utf8').replace('loadCorkPlaceIndex();initPersonalPlaceUI();','');
const dataset=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/places/cork-osm.json'),'utf8'));
function setup(){
 const stored=new Map(),calls=[];
 const ctx={console,Date,JSON,Number,Math,Map,Set,AbortController,DOMException,setTimeout,clearTimeout,XPLORE_AUTOCOMPLETE_LIMIT:8,
  localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},
  normaliseIrishAddressText:v=>String(v).trim().replace(/\s+/g,' '),
  addressSearchBias:()=>({lat:51.89,lon:-8.47}),
  haversineDistanceKm:(a,b)=>Math.hypot(a.lat-b.lat,a.lon-b.lon)*111,
  isInsideIrelandBounds:p=>p.lat>=51.25&&p.lat<=55.45&&p.lon>=-10.75&&p.lon<=-5.25,
  uniqueAddressParts:p=>[...new Set(p.filter(Boolean))],
  fetch:async()=>({ok:true,json:async()=>dataset}),
  fetchDynamicAddressSuggestions:async(field,q)=>{calls.push(q);return [{primary:'Unrelated Place',name:'Unrelated Place',lat:51.8,lon:-8.4}];},
  fetchPhotonSuggestions:async(field,q)=>{calls.push(q);return [{primary:'New Bistro',name:'New Bistro',lat:51.8,lon:-8.4}];}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,calls,stored};
}
test('Desi Bites long address resolves to explicitly approximate estate pin without remote geocoding',async()=>{
 const {ctx,calls}=setup();const items=await ctx.fetchDynamicAddressSuggestions('to','Desi Bites Cafe & Restaurant at John Harrington Industrial Estate, Tramore Rd, Ballyphehane, Cork');
 assert.equal(items[0].primary,'Desi Bites Cafe & Restaurant');assert.equal(items[0].precision,'estate');
 assert.match(items[0]._xploreMatchLabel,/entrance not verified/);assert.match(items[0].name,/estate-level/);assert.equal(calls.length,0);
});
test('real Cork OSM index finds a known place locally',async()=>{
 const {ctx,calls}=setup();const items=await ctx.fetchDynamicAddressSuggestions('to','English Market, Cork');
 assert.ok(items.some(p=>/english market/i.test(p.primary)));assert.equal(calls.length,0);
});
test('name matching handles ampersands, case, diacritics and partial tokens',()=>{
 const {ctx}=setup();assert.ok(ctx.matchingPlaceScore('DÉSI BItes cafe and restaurant, Cork',{name:'Desi Bites Cafe & Restaurant'})>0);
 assert.ok(ctx.matchingPlaceScore('Desi Bi',{name:'Desi Bites Cafe & Restaurant'})>0);
 assert.equal(ctx.matchingPlaceScore('Desi Bites',{name:'Tasty Bites'}),0);
});
test('explicit other city does not match Cork correction',async()=>{
 const {ctx}=setup();for(const city of ['Dublin','Dundalk']){const items=await ctx.fetchDynamicAddressSuggestions('to',`Desi Bites, ${city}`);assert.ok(items.every(p=>p.precision!=='estate'));}
});
test('unrelated long-query results trigger business-name retry and repeat searches use cache',async()=>{
 const {ctx,calls}=setup();const query='New Bistro at Industrial Estate, Cork';
 const items=await ctx.fetchDynamicAddressSuggestions('to',query);assert.equal(items[0].primary,'New Bistro');assert.equal(calls[1],'New Bistro, Cork');
 await ctx.fetchDynamicAddressSuggestions('to',query);assert.equal(calls.length,2);
});
test('aborted queries return no stale results',async()=>{
 const {ctx,calls}=setup(),controller=new AbortController();controller.abort();
 await assert.rejects(ctx.fetchDynamicAddressSuggestions('to','Desi Bites',controller.signal),{name:'AbortError'});assert.equal(calls.length,0);
});
test('personal pins persist and work when Cork index/online services fail',async()=>{
 const {ctx}=setup();ctx.savePersonalPlace({name:'My Cork cafe',address:'Cork',lat:51.89,lon:-8.47});
 ctx.fetch=async()=>{throw Error('offline');};
 const items=await ctx.fetchDynamicAddressSuggestions('to','My Cork cafe');assert.equal(items[0].provider,'Personal saved pin');assert.equal(items[0].precision,'user_pin');
 assert.throws(()=>ctx.savePersonalPlace({name:'Bad pin',lat:NaN,lon:-8.4}));assert.throws(()=>ctx.savePersonalPlace({name:'Outside Ireland',lat:10,lon:10}));
});
test('curated address pin is available if local extract cannot load',async()=>{
 const {ctx,calls}=setup();ctx.fetch=async()=>{throw Error('offline');};const items=await ctx.fetchDynamicAddressSuggestions('to','Desi Bites Cork');
 assert.equal(items[0].precision,'estate');assert.equal(calls.length,0);
});

test('a saved entrance pin replaces the approximate correction for the same named business',async()=>{
 const {ctx}=setup();ctx.savePersonalPlace({name:'Desi Bites',lat:51.876,lon:-8.482});
 const items=await ctx.fetchDynamicAddressSuggestions('to','Desi Bites Cork');
 assert.equal(items[0].precision,'user_pin');assert.ok(items.every(p=>p.precision!=='estate'));
});
