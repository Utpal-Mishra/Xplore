/* XPLORE v0.9.0 — multimodal geometry, transfer and fare primitives.
 * Browser + CommonJS compatible for deterministic regression tests.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.XploreMultimodalCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const toRad=v=>v*Math.PI/180;

  function fnv1a32(value){
    let hash=0x811c9dc5;
    const bytes=typeof TextEncoder!=='undefined'
      ?new TextEncoder().encode(String(value))
      :Array.from(unescape(encodeURIComponent(String(value))),c=>c.charCodeAt(0));
    for(const byte of bytes){
      hash^=byte;
      hash=Math.imul(hash,0x01000193)>>>0;
    }
    return hash>>>0;
  }

  function shapeShard(shapeId,count=64){
    if(!Number.isInteger(count)||count<=0||(count&(count-1)))throw new Error('shape shard count must be a positive power of two');
    const width=Math.max(2,(count-1).toString(16).length);
    return (fnv1a32(String(shapeId))&(count-1)).toString(16).padStart(width,'0');
  }

  function decodePolyline5(encoded){
    if(!encoded)return [];
    const coordinates=[];
    let index=0,lat=0,lon=0;
    while(index<encoded.length){
      let result=0,shift=0,byte;
      do{
        if(index>=encoded.length)return [];
        byte=encoded.charCodeAt(index++)-63;
        result|=(byte&0x1f)<<shift;
        shift+=5;
      }while(byte>=0x20);
      lat+=(result&1)?~(result>>1):(result>>1);

      result=0;shift=0;
      do{
        if(index>=encoded.length)return [];
        byte=encoded.charCodeAt(index++)-63;
        result|=(byte&0x1f)<<shift;
        shift+=5;
      }while(byte>=0x20);
      lon+=(result&1)?~(result>>1):(result>>1);
      coordinates.push([lat/1e5,lon/1e5]);
    }
    return coordinates;
  }

  function distanceMeters(a,b){
    if(!a||!b)return Infinity;
    const lat1=toRad(+a.lat),lat2=toRad(+b.lat);
    const dLat=lat2-lat1,dLon=toRad(+b.lon-(+a.lon));
    const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*6371000*Math.asin(Math.min(1,Math.sqrt(h)));
  }

  function nearestPointIndex(points,point,start=0){
    let best=-1,bestDistance=Infinity;
    for(let i=Math.max(0,start);i<points.length;i++){
      const candidate={lat:points[i][0],lon:points[i][1]};
      const d=distanceMeters(candidate,point);
      if(d<bestDistance){bestDistance=d;best=i;}
    }
    return {index:best,distance:bestDistance};
  }

  function shapeSegment(points,board,alight,maxSnapMeters=500){
    if(!Array.isArray(points)||points.length<2||!board||!alight)return null;
    const start=nearestPointIndex(points,board,0);
    if(start.index<0||start.distance>maxSnapMeters)return null;
    const end=nearestPointIndex(points,alight,start.index);
    if(end.index<=start.index||end.distance>maxSnapMeters)return null;
    return {
      points:points.slice(start.index,end.index+1),
      boardSnapMeters:Math.round(start.distance),
      alightSnapMeters:Math.round(end.distance)
    };
  }

  function transferBufferSeconds(distanceM){
    const distance=Math.max(0,Number(distanceM)||0);
    return Math.max(120,Math.round(60+distance/1.32));
  }

  function validTransfer(firstArrival,nextDeparture,distanceM,maxWaitSeconds=5400){
    const arrival=Number(firstArrival),departure=Number(nextDeparture);
    if(!Number.isFinite(arrival)||!Number.isFinite(departure))return false;
    const ready=arrival+transferBufferSeconds(distanceM);
    return departure>=ready&&departure<=ready+maxWaitSeconds;
  }

  function regionForPoint(point){
    if(!point)return null;
    const cork={lat:51.8985,lon:-8.4756};
    const dublin={lat:53.3498,lon:-6.2603};
    if(distanceMeters(point,cork)<=16000)return 'cork_city';
    if(distanceMeters(point,dublin)<=26000)return 'dublin_city';
    return null;
  }

  function itineraryFareEvidence(item,stopLookup,rules){
    if(!item||!Array.isArray(item.legs)||!item.legs.length||!rules)return {status:'unavailable',label:'Fare lookup required'};
    const points=[];
    for(const leg of item.legs){
      const a=stopLookup?.[leg.boardStopId],b=stopLookup?.[leg.alightStopId];
      if(!a||!b)return {status:'unavailable',label:'Fare lookup required'};
      points.push({lat:+a[1],lon:+a[2]},{lat:+b[1],lon:+b[2]});
    }
    const regions=new Set(points.map(regionForPoint));
    if(regions.size!==1||regions.has(null))return {status:'unavailable',label:'Fare varies by operator / zone'};
    const region=[...regions][0];
    const rule=rules.regions?.[region];
    if(!rule)return {status:'unavailable',label:'Fare lookup required'};
    return {
      status:'reference',
      region,
      label:rule.label,
      adultLeap:rule.adultLeap,
      youngAdultStudent:rule.youngAdultStudent,
      childLeap:rule.childLeap,
      eligibility:rule.eligibility,
      source:rule.source,
      verifiedAt:rules.verifiedAt
    };
  }

  return {
    fnv1a32,shapeShard,decodePolyline5,distanceMeters,nearestPointIndex,shapeSegment,
    transferBufferSeconds,validTransfer,regionForPoint,itineraryFareEvidence
  };
});
