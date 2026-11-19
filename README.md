# XPLORE

XPLORE is a human-centred navigation and decision-intelligence pilot for Ireland. Instead of optimising only for the fastest ETA, it compares journey options using time, carbon, activity, comfort, confidence and contextual route signals, then explains why a route is being recommended.

## Current release — Ireland v0.6.0 · Learn

The current web pilot includes:

1. Ireland-wide Start/Destination search with dynamic suggestions and explicit selection.
2. Driving, cycling and walking route alternatives.
3. Scheduled Ireland public transport using the official NTA GTFS feed, including direct and one-transfer journeys.
4. Best-effort Irish Rail realtime context.
5. XPLORE scoring and structured route explanations.
6. Route Segment Intelligence for sampled cycling, greenery, foot/sidewalk, major-road, lighting and accessibility signals.
7. Live GPS guidance for road/path modes with route recovery and optional Screen Wake Lock.
8. Weather and European AQI context.
9. Natural/dark map styles and mobile navigation-first layouts.
10. **v0.6 Learn:** privacy-first journey feedback, route-quality reporting and a rolling 30-day local product-analytics funnel.

The current web application remains a pilot. Routing, geocoding and some context services use development/public adapters that should be replaced or governed before production scale.

## v0.6 Learn

XPLORE now measures whether the product is actually helping, not just whether features exist.

The local funnel records:

```text
Search -> Results -> Guidance -> Arrival -> Feedback
```

Journey Feedback can capture:

- Good / Okay / Poor
- destination correctness
- route-quality / ETA / map-data / safety / accessibility / transit issues
- whether the user would choose XPLORE's recommendation over simply taking the fastest route
- an optional local free-text note

### Privacy boundary

v0.6 analytics deliberately exclude:

- raw latitude/longitude
- GPS coordinates
- typed addresses
- Eircodes
- destination/origin names
- search text
- free-text notes from anonymous analytics payloads

Distance, duration, score and confidence are stored as coarse bands. Local learning data expires after 30 days and is capped. Users can export or clear their local learning record.

There is **no remote analytics collector configured by default**. A future governed XPLORE endpoint can be enabled without exposing privileged credentials in browser JavaScript.

See [docs/V06_LEARNING.md](docs/V06_LEARNING.md).

## Transit

Transit v1 uses the official NTA GTFS schedule feed, refreshed automatically each day. It supports nearby-stop discovery, direct and one-transfer itineraries, access/egress walking, transit-aware XPLORE scoring and mapped stop sequences.

Current transit limitations:

- NTA bus GTFS-Realtime is not yet connected because production API credentials must not be embedded in the static client.
- exact GTFS shape geometry is still pending
- unrestricted multi-transfer RAPTOR/CSA journey planning is pending
- fares/Leap caps are pending
- transit stop-by-stop guidance is pending

See [docs/TRANSIT_V1.md](docs/TRANSIT_V1.md).

## Navigation recovery

Active walking/cycling/driving guidance is saved in the current browser tab. Returning from lock/background resizes/repaints the map, restarts GPS and requests a fresh fix. Reloading can restore route alternatives, selected route, destination, mode, preferences, voice state and the last retained position without immediately calling the routing service again.

Browser geolocation still cannot provide reliable screen-off tracking. A native mobile service is required for dependable background GPS and lock-screen navigation.

See [docs/NAVIGATION_RECOVERY.md](docs/NAVIGATION_RECOVERY.md).

## Place search

XPLORE combines dynamic Ireland search with a richer Cork place index, address corrections and personal saved pins. Ordinary fuzzy results still require explicit selection before routing; exact Eircodes use the dedicated fail-safe resolution path.

The richer static named-place index is currently Cork-focused and should be generalised Ireland-wide in a later release.

See [docs/CORK_PLACE_SEARCH.md](docs/CORK_PLACE_SEARCH.md).

## Architecture

Core direction:

```text
Live Map
  -> Location Intelligence
  -> Route / Transit Adapters
  -> Context Layers
  -> Decision Engine
  -> Explanation
  -> Learning & Evaluation
```

Routing providers generate candidates; XPLORE remains responsible for recommendation logic, confidence, explanation and learning.

See:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/ENTERPRISE_READINESS.md](docs/ENTERPRISE_READINESS.md)
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)

## Validation

Automated:

```bash
node --check learning-core.js
node --check learning-v06.js
node --test tests/*.test.cjs
python -m py_compile scripts/build_transit_data.py
```

The repository now includes a pull-request/main-branch quality-gate workflow.

Real-device acceptance testing is still required for mobile navigation recovery, search/pin selection and the new feedback bottom-sheet flow.

## Next releases

### v0.7 — Live Mobility
- XPLORE-controlled NTA GTFS-Realtime adapter
- live bus arrivals / trip updates
- service alerts
- stronger Irish Rail realtime integration
- realtime reliability in the decision layer

### v0.8 — Decision Intelligence
- validate Route Segment Intelligence across representative Irish journeys
- introduce validated route intelligence into XPLORE scoring
- strengthen accessibility/safety evidence boundaries

### v0.9 — Multimodal
- exact GTFS shapes
- stronger transfer planning
- fare / Leap comparison
- disruption-aware recovery

### v1.0 Beta
- reliability gates
- privacy/monitoring controls
- tester analytics
- Founding Tester programme

## Audit trail

XPLORE maintains structured decision, system, architecture, risk, data, validation and release logs. The v0.6 release record is:

[docs/logs/2026-11-19-v0.6-learning-release.md](docs/logs/2026-11-19-v0.6-learning-release.md)
