// XPLORE Ireland v0.3.3 — development Eircode resolver chain.
// Exact Eircodes should be resolved by an Eircode-aware provider before OSM/Nominatim.
// This public endpoint is used only as a low-volume development adapter; it is not
// the intended production dependency. Production should use an approved/licensed
// Eircode provider behind an XPLORE-controlled server-side API.

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
      method:'POST',
      mode:'cors',
      headers:{'Accept':'application/json','Content-Type':'application/json'},
      body:JSON.stringify({eircode}),
      signal:controller.signal
    });
    if(!response.ok)return null;
    const data=await response.json();
    const returned=normalizeEircode(data?.eircode||'');
    if(returned!==eircode||!validResolvedCoordinate(data?.location))return null;
    return {
      lat:+data.location.lat,
      lon:+data.location.lng,
      name:data.formattedAddress||eircode,
      eircode,
      provider:'Eircode development resolver'
    };
  }catch(error){
    console.warn('Dedicated Eircode development resolver unavailable; falling back to exact OSM lookup.',error);
    return null;
  }finally{
    window.clearTimeout(timeout);
  }
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
    throw new Error(`Eircode ${eircode} could not be resolved by either XPLORE's dedicated development resolver or the exact OpenStreetMap fallback. The old route has been cleared and XPLORE will not guess another location. Enter a street/building and town to use the full-address suggestion flow.`);
  }
};

IRELAND_NETWORK.version='Ireland v0.3.3';

// Load the explicit full-address suggestion module without requiring another
// index.html dependency. The module self-initialises whether it arrives before
// or after DOMContentLoaded.
(function loadAddressSearchModule(){
  if(document.querySelector('script[data-xplore-address-search]'))return;
  const script=document.createElement('script');
  script.src='address-search.js?v=0.3.3';
  script.async=false;
  script.dataset.xploreAddressSearch='true';
  document.head.appendChild(script);
})();
