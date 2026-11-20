# XPLORE

XPLORE is a human-centred navigation and decision-intelligence pilot for Ireland. Instead of optimising only for the fastest ETA, it compares journey options using time, carbon, activity, comfort, confidence and contextual route signals, then explains why a route is being recommended.

## Current release — Ireland v1.0.0 Beta

The current web pilot includes:

1. Ireland-wide Start/Destination search with dynamic suggestions and explicit selection.
2. Driving, cycling and walking route alternatives.
3. Ireland public transport planning using official NTA GTFS schedules, with a bounded search supporting direct journeys and up to two transfers.
4. **v0.7 Live Mobility:** strict-match NTA GTFS-Realtime v2 enrichment for compatible transit trips, including live timing, reliability, vehicle positions and route-specific alerts.
5. Irish Rail public realtime as a rail fallback/cross-check.
6. **v1.0 Beta:** release gates, explicit local-analytics controls, privacy-safe production monitoring and a pseudonymous Founding Tester workflow.
7. **v0.9 Multimodal:** official GTFS source-shape geometry, nearby-stop interchange planning and official-reference fare evidence.
8. **v0.8 Decision Intelligence:** evidence-gated Route Intelligence can influence road/path XPLORE scoring and reranking only when route-match/sample thresholds pass.
9. Structured route explanations with effective scoring weights and evidence tiers.
10. Route Segment Intelligence for sampled cycling, greenery, foot/sidewalk, major-road, lighting and accessibility signals.
11. Live GPS guidance for road/path modes with route recovery and optional Screen Wake Lock.
12. Weather and European AQI context.
13. Natural/dark map styles and mobile navigation-first layouts.
14. **v0.6 Learn:** privacy-first journey feedback, route-quality reporting and a rolling 30-day local product-analytics funnel.

The current web application remains a pilot. Routing, geocoding and some context services still use development/public adapters that should be governed or replaced before production scale.

## v0.9 Multimodal

Transit now uses three stronger decision inputs:

- **GTFS source shapes:** today's active `shape_id` geometry is encoded into deterministic 64-shard files. The browser loads only geometry needed by the selected itinerary. Missing/unmatched shapes fall back to stop-sequence geometry.
- **Bounded stronger transfers:** the planner searches up to three transit legs / two transfers, supports same-station and nearby-stop interchanges within 250 m, includes transfer walking time and enforces a minimum interchange buffer. Search breadth is deliberately bounded for mobile-browser reliability rather than claiming to be a full national RAPTOR service.
- **Fare evidence:** XPLORE can show official TFI 90-minute fare references for bounded Cork/Dublin city contexts. These are reference values, not guaranteed ticket quotes; eligibility/operator/zone rules must be verified and fares do not affect XPLORE Score.

See [docs/V09_MULTIMODAL.md](docs/V09_MULTIMODAL.md).

## v0.8 Decision Intelligence

Route Intelligence now participates in road/path scoring only after an explicit evidence-quality gate.

- High evidence: >=10 samples, >=82% route-to-road match, <=30 km
- Medium evidence: >=10 samples, >=70% match, <=50 km
- Long-route medium evidence: >=8 samples, >=78% match, >50 km
- Indicative evidence: displayed but contributes 0% to the score

Maximum configured Route Intelligence influence is bounded by preference: 12% Balanced, 8% Greenest, 13% Healthiest and 20% Calmest. Medium evidence is attenuated further.

Lighting is scored only when at least half of matched route-road samples have explicit lighting tags. Accessibility observations remain evidence-only; missing accessibility tags are never interpreted as inaccessible.

See [docs/V08_DECISION_INTELLIGENCE.md](docs/V08_DECISION_INTELLIGENCE.md).

## v0.7 Live Mobility

XPLORE can distinguish between a journey that is merely scheduled and a journey for which fresh, exact-match realtime evidence is available.

```text
Broad NTA scheduled journey
  -> prove compatibility with current realtime static GTFS
  -> exact trip + ordered-stop match
  -> fresh GTFS-Realtime evidence
  -> timing / reliability / transfer-risk update
  -> XPLORE reranking
```

Realtime can affect displayed departure/arrival/duration, transit reliability, connection risk, candidate ranking, explanation chips, matched vehicle positions and route-specific service-alert context.

A cancelled service or an already-missed live connection cannot remain XPLORE's highest-scored option simply because its schedule looked good.

### Fail-safe rule

Scheduled public transport is always the fallback.

Realtime is not applied when the NTA realtime key is not configured, the snapshot is stale, the compatible static generation is unavailable, trip IDs or ordered stop sequences do not match, a trip has no matching live update, or the realtime build fails.

The NTA API key is consumed only by the server-side snapshot workflow and is never embedded in browser JavaScript or generated data.

See [docs/V07_LIVE_MOBILITY.md](docs/V07_LIVE_MOBILITY.md).

## v0.6 Learn

The v0.6 learning layer remains active underneath v0.7.

The local funnel records:

```text
Search -> Results -> Guidance -> Arrival -> Feedback
```

Feedback can capture Good / Okay / Poor, destination correctness, route-quality issue codes, recommendation-vs-fastest preference and an optional local note.

Analytics deliberately exclude raw GPS, coordinates, typed addresses, Eircodes, place names and search text. Distance, duration, score and confidence are stored as coarse bands. Local learning data expires after 30 days and is capped.

See [docs/V06_LEARNING.md](docs/V06_LEARNING.md).

### Website analytics

The live GitHub Pages app offers an optional Google Analytics setting under **Website analytics privacy**. It starts off and can be withdrawn in the same panel. Local journey analytics use their own controls.

Before deploying, disable Enhanced Measurement in the XPLORE GA4 web stream to keep the tag from automatically measuring forms, site searches, or other app interactions. Keep Google Ads destinations and automatic user-provided data collection disabled. On deployment, use Google Tag Assistant and GA4 Realtime or DebugView to verify one page view after opting in, no Google Analytics requests before opt-in or after withdrawal, and no route inputs, identifiers, or full referrer URLs in the payload.

## Transit

The scheduled planner uses the broad official NTA `GTFS_All.zip` feed so XPLORE does not reduce timetable coverage simply to gain realtime compatibility.

The daily build also reads the current NTA `GTFS_Realtime.zip` static generation. Only trips whose **trip ID and complete ordered stop sequence** match are eligible for v0.7 live updates.

Remaining transit limitations:

- the NTA API key must be configured in repository secret `NTA_GTFS_RT_API_KEY` before the live snapshot can activate
- GTFS source shapes are integrated for selected itineraries; missing shapes still fall back safely
- transfer search is bounded to two transfers rather than an unrestricted national RAPTOR/CSA service
- fare evidence is reference-only outside cases where an authoritative future fare engine can prove eligibility
- transit stop-by-stop guidance is pending
- full disruption-aware replanning/missed-connection recovery is a later milestone

See [docs/TRANSIT_V1.md](docs/TRANSIT_V1.md).

## Navigation recovery

Active walking/cycling/driving guidance is saved in the current browser tab. Returning from lock/background resizes/repaints the map, restarts GPS and requests a fresh fix. Reloading can restore the route and navigation state without immediately calling the routing service again.

Browser geolocation still cannot provide dependable screen-off tracking; native mobile location services are required for that.

See [docs/NAVIGATION_RECOVERY.md](docs/NAVIGATION_RECOVERY.md).

## Place search

XPLORE combines dynamic Ireland search with a richer Cork place index, address corrections and personal saved pins. Fuzzy results still require explicit selection before routing; exact Eircodes use the dedicated fail-safe resolver.

The richer named-place index is still Cork-focused and should be generalised Ireland-wide later.

See [docs/CORK_PLACE_SEARCH.md](docs/CORK_PLACE_SEARCH.md).

## Architecture

```text
Live Map
  -> Location Intelligence
  -> Route / Transit Adapters
  -> Live Mobility Evidence
  -> Context Layers
  -> Decision Engine
  -> Explanation
  -> Learning & Evaluation
```

Routing and transport providers generate evidence/candidates; XPLORE remains responsible for recommendation logic, confidence, explanation, freshness boundaries and learning.

See:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/ENTERPRISE_READINESS.md](docs/ENTERPRISE_READINESS.md)
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)

## Validation

Automated:

```bash
node --check learning-core.js
node --check learning-v06.js
node --check realtime-core.js
node --check realtime-v07.js
node --check transit-live-patch-v07.js
node --check decision-core-v08.js
node --check decision-v08.js
node --check multimodal-core-v09.js
node --check multimodal-v09.js
node --check beta-core-v10.js
node --check beta-v10.js
node --test tests/*.test.cjs
python -m py_compile scripts/build_transit_data.py scripts/build_realtime_snapshot.py scripts/release_gate.py scripts/beta_monitor.py
python scripts/release_gate.py --repo .
```

The repository quality gate runs on pull requests and main-branch changes.

Real-device acceptance testing remains required for mobile navigation recovery, search/pin selection, feedback UI and v0.7 live transit badges/vehicle markers.

## Beta validation

The release remains subject to real-device testing and the Founding Tester evidence cycle. A wider public launch should depend on stable search/routing behaviour, green production smoke checks and useful structured tester feedback rather than the version number alone.

## Audit trail

XPLORE maintains structured decision, system, architecture, risk, data, validation and release logs.

- [v1.0 Beta release log](docs/logs/2026-11-19-v1.0-beta.md)
- [v0.9 Multimodal release log](docs/logs/2026-11-19-v0.9-multimodal.md)
- [v0.8 Decision Intelligence release log](docs/logs/2026-11-19-v0.8-decision-intelligence.md)
- [v0.7 Live Mobility release log](docs/logs/2026-11-19-v0.7-live-mobility.md)
- [v0.6 Learn release log](docs/logs/2026-11-19-v0.6-learning-release.md)
