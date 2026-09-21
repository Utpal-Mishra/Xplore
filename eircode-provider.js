// XPLORE Ireland v0.5.0 — Eircode resolver + product-module loader.
// Exact Eircodes should be resolved by an Eircode-aware provider before fuzzy place search.
// This public endpoint is used only as a low-volume development adapter; production should
// use an approved/licensed Eircode provider behind an XPLORE-controlled server-side API.

const EIRCODE_PUBLIC_PILOT_ENDPOINT='https://www.agentcompare.ie/api/location/resolve-eircode';
const EIRCODE_PUBLIC_PILOT_TIMEOUT_MS=9000;

function validResolvedCoordinate(location){
  return location&&Number.isFinite(+location.lat)&&Number.isFinite(+location.lng)&&
    isInsideIrelandBounds({lat:+location.lat,lon:+location.lng});
}

async function resolveEircodeViaPublicPilotProvider(eircode){
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),EIRCODE_PUBLIC_PILOT_TIMEOUT_MS);
  try{
    const response=await fetch(EIRCODE_PUBLIC_PILOT_ENDPOINT,{
      method:'POST',mode:'cors',headers:{'Accept':'application/json','Content-Type':'application/json'},
      body:JSON.stringify({eircode}),signal:controller.signal
    });
    if(!response.ok)return null;
    const data=await response.json();
    const returned=normalizeEircode(data?.eircode||'');
    if(returned!==eircode||!validResolvedCoordinate(data?.location))return null;
    return {lat:+data.location.lat,lon:+data.location.lng,name:data.formattedAddress||eircode,eircode,provider:'Eircode development resolver'};
  }catch(error){
    console.warn('Dedicated Eircode development resolver unavailable; falling back to exact OSM lookup.',error);
    return null;
  }finally{window.clearTimeout(timeout);}
}

const osmExactResolveEircode=resolveEircode;
resolveEircode=async function(eircode){
  setStatus(`Verifying Eircode ${eircode} with the dedicated resolver…`);
  const dedicated=await resolveEircodeViaPublicPilotProvider(eircode);
  if(dedicated)return dedicated;
  setStatus(`Dedicated Eircode resolver unavailable for ${eircode} · checking exact OpenStreetMap match…`);
  try{
    const osm=await osmExactResolveEircode(eircode);
    return {...osm,provider:'OpenStreetMap exact postcode'};
  }catch(error){
    throw new Error(`Eircode ${eircode} could not be resolved by either XPLORE's dedicated development resolver or the exact OpenStreetMap fallback. XPLORE will not guess another location. Type the building/street and town instead.`);
  }
};

function loadXploreScriptOnce(src,id,onload){
  const existing=document.getElementById(id);
  if(existing){if(onload&&existing.dataset.loaded==='true')onload();return;}
  const script=document.createElement('script');
  script.id=id;script.src=src;script.async=false;
  script.onload=()=>{script.dataset.loaded='true';if(onload)onload();};
  script.onerror=()=>console.error(`Could not load ${src}`);
  document.head.appendChild(script);
}

function setXploreReleaseVersion(){
  IRELAND_NETWORK.version='Ireland v0.5.0';
  const versionBadge=document.querySelector('.header-meta .pill');
  if(versionBadge)versionBadge.textContent='Ireland v0.5.0';
}

function loadXploreV050Modules(){
  loadXploreScriptOnce('address-search.js?v=0.5.0','xplore-address-search-script',()=>{
    loadXploreScriptOnce('transit-bootstrap.js?v=0.5.0','xplore-transit-bootstrap-script',()=>{
      loadXploreScriptOnce('transit.js?v=0.5.0','xplore-transit-script',()=>{
        loadXploreScriptOnce('transit-safety.js?v=0.5.0','xplore-transit-safety-script',()=>{
          loadXploreScriptOnce('route-intelligence.js?v=0.5.0','xplore-route-intelligence-script',()=>{
            loadXploreScriptOnce('mobile-ui.js?v=0.5.0','xplore-mobile-ui-script',()=>setXploreReleaseVersion());
          });
        });
      });
    });
  });
}

setXploreReleaseVersion();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadXploreV050Modules,{once:true});
else loadXploreV050Modules();
