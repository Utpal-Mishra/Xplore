# XPLORE Data Sources and Adapter Boundaries

XPLORE keeps external providers behind product-owned adapters. External ranking or labels are not automatically treated as XPLORE recommendations.

## Map / cartography

Current:
- OpenStreetMap-derived vector data through OpenFreeMap / MapLibre
- Leaflet as the planning-map shell
- MapLibre native navigation viewport during Guidance

Modes include dark and XPLORE Natural cartography.

Production boundary:
- preserve required attribution
- avoid relying on unsupported public infrastructure as an enterprise SLA
- keep style/source selection configurable

## Place / address search

Current:
- Photon/OpenStreetMap dynamic autocomplete for ordinary place/address search
- explicit user selection before routing
- exact Eircode development resolver with exact OSM fallback
- richer Cork named-place index and personal saved pins

Privacy:
- public autocomplete receives only a coarsened location bias when a location is already known
- fuzzy suggestions never silently become a routed destination

Production boundary:
- move authoritative Irish address/Eircode coverage behind an approved provider
- generalise the richer local place index Ireland-wide

## Road/path routing

Current development adapters:
- driving: OSRM public demo
- cycling: openstreetmap.de routed-bike
- walking: openstreetmap.de routed-foot

The internal candidate schema and XPLORE scoring remain provider-independent.

## Route Segment Intelligence

Current:
- sampled OpenStreetMap/Overpass context near the selected route
- cycling support/protection
- green proximity
- foot/sidewalk support
- major-road exposure
- lighting-tag availability
- accessibility positive/concern signals

v0.8 applies an evidence gate before any of these signals can affect the main XPLORE Score. High/Medium evidence can contribute a bounded Route Intelligence component; Indicative evidence is displayed with zero score influence.

Scored contextual signals are mode-specific:
- cycling: protected/general cycling context, green proximity, lower major-road exposure, sufficiently covered lighting
- walking: foot/sidewalk support, green proximity, lower major-road exposure, sufficiently covered lighting
- driving: lower major-road exposure, green proximity, sufficiently covered lighting

Accessibility remains evidence-only. Missing accessibility or lighting tags are treated as unknown rather than negative evidence.

## Weather

Current:
- Open-Meteo Forecast API
- route-area temperature, precipitation and wind context

## Air quality

Current:
- Open-Meteo Air Quality API
- European AQI and PM2.5 context

## Scheduled public transport

Official NTA static sources:
- `GTFS_All.zip` for broad Ireland scheduled journey planning
- `GTFS_Realtime.zip` to prove compatibility with the current realtime generation

The daily build publishes compact browser schedule data.

## Transit geometry and fare evidence — v0.9

NTA GTFS `shapes.txt` is used as the source path geometry for active transit trips. Geometry is encoded/sharded during the daily build and loaded lazily for selected itineraries.

Current fare evidence uses verified public TFI reference rules stored with source/verification metadata. The current GTFS data path is not treated as a universal fare engine. If journey eligibility cannot be bounded, XPLORE displays "Fare lookup required" instead of creating a price.

Fare evidence does not affect XPLORE Score.

## Live public transport — v0.7

NTA GTFS-Realtime v2:
- server-side authenticated access only
- browser-safe snapshot produced outside the client
- trip updates
- vehicle positions
- service alerts

Strict join:
- exact trip ID
- exact complete ordered stop sequence against the current realtime-compatible static GTFS

Freshness:
- stale data is rejected/falls back to scheduled information

Security:
- `NTA_GTFS_RT_API_KEY` is a GitHub Actions secret
- the public site does not contain the key
- no XPLORE user GPS/location is sent to NTA to retrieve the system-wide feed

## Irish Rail realtime

Current:
- public Irish Rail station realtime as rail fallback/cross-check
- due/late/expected departure information where browser access and station matching succeed

NTA GTFS-Realtime is the primary cross-mode live layer when a strict match exists.

## Transit carbon

Current:
- indicative mode factors applied to approximate stop-to-stop distance
- decision-support only, not a verified journey carbon inventory

Production work should version and document emissions factors.

## Community Truth

Current:
- prototype only

Future persisted reports require source, timestamp, spatial precision, verification state, corroboration, confidence and expiry/moderation.

Community reports must not create safety-critical routing claims without sufficient evidence.

## Learning / product analytics

v0.6:
- local 30-day coarse funnel and route-quality feedback
- no raw GPS, typed addresses, Eircodes, place names or search text in analytics
- no remote collector configured by default

## XPLORE-owned decision logic

Provider-independent product logic includes:
- candidate normalisation
- preference weighting
- XPLORE score
- transit/live reliability heuristics
- journey confidence
- freshness gates
- transfer-risk penalties
- route-intelligence analysis
- Route Intelligence evidence gating and confidence attenuation
- mode-specific Route Intelligence quality scoring
- structured explanations
- learning/feedback taxonomy

Provider evidence is labelled by source/freshness before it reaches the decision layer.
