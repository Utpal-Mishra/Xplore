"""Build a static Cork city/suburbs POI index from OSM; never query per keystroke."""
import argparse, datetime, json, pathlib, urllib.parse, urllib.request
BBOX = [51.82, -8.66, 51.96, -8.32]
QUERY = '[out:json][timeout:45];nwr["name"][~"^(amenity|shop|tourism|leisure|office|craft)$"~"."](%s);out center tags;' % ','.join(map(str, BBOX))
def build(payload):
    places = []
    for item in payload.get('elements', []):
        tags = item.get('tags', {}); point = item.get('center', item)
        lat, lon = point.get('lat'), point.get('lon')
        if not tags.get('name') or not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)): continue
        if not (BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]): continue
        if any(k.startswith('disused:') or k.startswith('abandoned:') for k in tags): continue
        aliases = [a.strip() for key in ('alt_name', 'short_name', 'name:en', 'name:ga', 'brand') for a in tags.get(key, '').split(';') if a.strip()]
        address = ', '.join(filter(None, [' '.join(filter(None, [tags.get('addr:housenumber'), tags.get('addr:street')])), tags.get('addr:suburb'), tags.get('addr:city', 'Cork area'), tags.get('addr:postcode')]))
        places.append({'id':f"{item['type']}/{item['id']}", 'name':tags['name'], 'aliases':aliases, 'address':address, 'lat':lat, 'lon':lon, 'type':next((tags[k] for k in ('amenity','shop','tourism','leisure','office','craft') if k in tags),'place'), 'precision':'mapped_place' if item['type']=='node' else 'mapped_centroid'})
    return {'version':1,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'osmBase':payload.get('osm3s',{}).get('timestamp_osm_base'),'coverage':'Cork city and surrounding suburbs; not all County Cork','bbox':BBOX,'source':'OpenStreetMap contributors via Overpass','license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/','query':QUERY,'places':places}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input');parser.add_argument('--output',default='data/places/cork-osm.json');parser.add_argument('--endpoint',default='https://overpass-api.de/api/interpreter');args=parser.parse_args()
    if args.input: payload=json.loads(pathlib.Path(args.input).read_text())
    else:
        request=urllib.request.Request(args.endpoint,data=urllib.parse.urlencode({'data':QUERY}).encode(),headers={'User-Agent':'XPLORE-Cork-coverage/0.5.3'})
        with urllib.request.urlopen(request,timeout=60) as response: payload=json.load(response)
    result=build(payload)
    if not result['places']: raise RuntimeError('Empty extract: existing index has been retained')
    path=pathlib.Path(args.output);path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')));temporary.replace(path)
    print(f"Saved {len(result['places'])} Cork-area places to {path}")
if __name__=='__main__':main()
