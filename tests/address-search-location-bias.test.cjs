const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');

const fullSource=fs.readFileSync(path.join(__dirname,'../address-search.js'),'utf8');
const source=fullSource.slice(0,fullSource.indexOf("if(document.readyState==='loading')"));

function parseCoordinates(query){
  const m=String(query||'').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if(!m)return null;
  const lat=+m[1],lon=+m[2];
  return Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon,name:'Coordinates'}:null;
}

function setup({from='53.16297, -6.92073',to='Circle K',features=[]}={}){
  const inputs={from:{value:from},to:{value:to}};
  let requestedUrl='';
  const ctx={
    console,Math,Number,String,Set,Map,URLSearchParams,AbortController,DOMException,
    window:{setTimeout,clearTimeout},
    state:{livePosition:null,liveTracking:false},
    IRELAND_NETWORK:{center:{lat:53.38,lon:-8.05}},
    $:id=>inputs[id]||null,
    parseCoordinates,
    isInsideIrelandBounds:p=>p.lat>=51.25&&p.lat<=55.45&&p.lon>=-10.75&&p.lon<=-5.25,
    normalizeEircode:()=>null,
    resolveEircode:async()=>{throw Error('not used');},
    setStatus:()=>{},
    resetJourneyPresentation:()=>{},
    routeBetween:async()=>{},
    renderLivePosition:()=>{},
    fetch:async url=>{requestedUrl=String(url);return {ok:true,json:async()=>({features})};}
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx);
  return {ctx,getRequestedUrl:()=>requestedUrl};
}

test('destination autocomplete uses typed Start coordinates as its locality bias',()=>{
  const {ctx}=setup();
  const bias=ctx.addressSearchBias('to');
  assert.equal(bias.source,'typed-start-coordinates');
  assert.equal(bias.lat,53.16297);
  assert.equal(bias.lon,-6.92073);
});

test('Photon suggestions are sorted nearest-first from the Start anchor',async()=>{
  const features=[
    {geometry:{coordinates:[-8.47,51.89]},properties:{name:'Circle K Cork',city:'Cork',country:'Ireland',countrycode:'IE',type:'fuel'}},
    {geometry:{coordinates:[-6.91,53.16]},properties:{name:'Circle K Kildare',town:'Kildare',county:'Kildare',country:'Ireland',countrycode:'IE',type:'fuel'}}
  ];
  const {ctx,getRequestedUrl}=setup({features});
  const items=await ctx.fetchPhotonSuggestions('to','Circle K');
  assert.equal(items[0].primary,'Circle K Kildare');
  assert.ok(items[0].distanceKm<items[1].distanceKm);
  const url=new URL(getRequestedUrl());
  assert.equal(url.searchParams.get('lat'),'53.16');
  assert.equal(url.searchParams.get('lon'),'-6.92');
});
