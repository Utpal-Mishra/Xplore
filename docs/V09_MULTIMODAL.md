# XPLORE v0.9 — Multimodal

XPLORE v0.9 strengthens scheduled public transport in three areas: GTFS source geometry, transfer planning and fare evidence.

## 1. GTFS source-shape geometry

The NTA GTFS feed associates trips with `shape_id` and publishes ordered shape points.

The daily build now:

1. identifies shape IDs used by today's active trips
2. reads their ordered points from `shapes.txt`
3. encodes the points using polyline precision 5 without topology simplification
4. partitions shapes into 64 deterministic FNV-1a shards
5. publishes the shard count/encoding in `manifest.json`

The trip schema appends:

- index 7: `shape_id`
- index 8: `agency_id`

Existing indexes used by v0.7 Live Mobility remain unchanged.

### Browser behaviour

The selected itinerary requests only the shard(s) containing its shape IDs.

For each leg XPLORE:

- decodes the GTFS geometry
- finds the nearest forward shape point to the boarding stop
- finds the nearest subsequent point to the alighting stop
- rejects a shape segment when either snap is more than 500 m
- renders the accepted GTFS segment

If a shape is absent or cannot be matched confidently, XPLORE keeps the existing scheduled stop-sequence line. A geometry failure never breaks journey planning.

"Exact" in v0.9 means the line follows the ordered GTFS source shape supplied for the trip. It does not mean turn-by-turn transit guidance or independently surveyed track/road geometry.

## 2. Stronger transfer planning

The earlier planner searched direct and same-stop one-transfer journeys.

v0.9 uses a bounded round search supporting:

- up to three transit legs
- up to two transfers
- same-stop transfers
- same-parent-station platform transfers
- nearby-stop interchange within 250 m
- transfer walking time
- minimum two-minute interchange buffer
- bounded maximum wait
- trip reuse prevention
- dominated-label pruning

Search breadth is intentionally capped. XPLORE remains a static web pilot, so v0.9 does not claim an unrestricted national RAPTOR/CSA service.

### Interchange time

```text
minimum transfer ready time =
  first arrival
  + max(120 seconds, 60 seconds + estimated interchange walk)
```

Nearby walking is estimated at 1.32 m/s.

The actual scheduled departure must occur after this ready time and within the bounded wait window.

### Realtime compatibility

v0.7 realtime enrichment already operates leg-by-leg, so fresh exact-match realtime timing can evaluate all legs of a v0.9 two-transfer itinerary.

A missed/tight connection continues to reduce live reliability.

## 3. Fare evidence

The current inspected NTA static feed exposes schedule/shape data but does not provide a national fare table that XPLORE can safely use as a universal ticket-price engine.

Therefore v0.9 deliberately distinguishes:

- **official fare reference** — XPLORE can show a current TFI reference value for a bounded city context
- **fare lookup required** — eligibility/operator/zone cannot be proven from the available journey data

Current reference rules include TFI 90 Minute fare references for Cork and Dublin, verified 2026-11-19.

They are stored in:

`data/transit/fare_rules_v09.json`

The application describes these as references, not guaranteed ticket quotes.

Fare values do **not** affect XPLORE Score.

## Build output

```text
data/transit/
  manifest.json
  stops.json
  trips.json
  agencies.json
  realtime_eligible.json
  fare_rules_v09.json
  shapes/
    00.json
    ...
    3f.json
```

Stop rows append `zone_id` after the existing parent-station field.

## Failure boundaries

- shape build unavailable -> scheduled stop geometry remains usable
- individual shape missing -> that leg uses stop geometry
- fare rule unavailable -> "Fare lookup required"
- transfer search produces no result -> direct/other modes remain usable
- NTA realtime unavailable -> scheduled v0.9 itinerary remains usable

## Validation

Automated coverage includes:

- canonical polyline encode/decode
- deterministic shape sharding
- forward board-to-alight clipping
- distant-shape rejection
- transfer walking/buffer logic
- excessive wait rejection
- Cork fare-reference classification
- cross-region price refusal
- module ordering
- schema backward compatibility
- builder syntax and existing realtime compatibility tests

## Remaining post-v0.9 work

- full authoritative fare engine if/when a suitable source/API is available
- unrestricted national routing backend if product scale requires it
- transit stop-by-stop guidance
- disruption-triggered automatic journey replanning
- richer station/vehicle accessibility evidence
