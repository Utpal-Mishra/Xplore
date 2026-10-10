# XPLORE

XPLORE is a human-centred navigation prototype for Cork, Ireland. It goes beyond the fastest route by helping people choose journeys based on sustainability, safety, quietness, accessibility, scenery and affordability.

## v0.2 Cork real-world pilot

The live pilot now moves beyond representative route cards toward real journey intelligence:

1. Real OpenStreetMap/Leaflet map rendering for Cork.
2. User-submitted place search and real route geometry.
3. Driving, cycling and walking route adapters with alternative routes.
4. XPLORE Route Score with preference weighting.
5. Journey Confidence shown separately from the route score.
6. Structured "Why this route?" explanations and trade-offs.
7. Live weather and European AQI context for the route area.
8. Current-location capture with explicit browser consent.

The routing, geocoding and environmental services currently used are development adapters. XPLORE keeps scoring, confidence and explanation logic provider-independent so production infrastructure can be changed without redesigning the product.

## Product direction

XPLORE should answer more than "How do I get there?" It should help answer: "What is the best journey for me, given my preferences and what is happening around me right now — and why?"

## Architecture and roadmap

See:

- `docs/XPLORE_V02_ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ENTERPRISE_READINESS.md`
- `docs/DATA_SOURCES.md`

## Next production steps

- Persist Community Truth observations with provenance, freshness, verification and expiry.
- Add real Cork route-segment features for cycling protection, accessibility, greenery and safety.
- Add automated routing-regression tests for representative Cork journeys.
- Move public development adapters to governed/self-hosted/commercial production infrastructure where required.
- Continue privacy, moderation, observability and enterprise-readiness controls.

## Navigation recovery (v0.5.1)

Active walking/cycling/driving guidance is saved in the current browser tab. Returning from lock/background resizes and repaints the existing map, restarts the GPS watch and requests an uncached fix. Reloading restores route alternatives, the selected route, destination, travel mode, preferences, voice setting and last known position without a routing-service request. A saved fix is marked stale until fresh GPS arrives. Stop Guidance, Stop live tracking and manual journey changes clear recovery. Sessions expire after 12 hours; closing the tab or clearing browser storage may remove them. Storage failure is reported without stopping navigation.

Optional **Keep screen on** uses the browser Screen Wake Lock API during active visible guidance. It cannot override manual screen locking.

**Screen-off live tracking and lock-screen navigation notifications are not implemented in this web release.** Browser geolocation is restricted to visible documents. Installing the website as a PWA does not remove that restriction. Reliable screen-off tracking needs a native mobile location service. See [navigation recovery notes](docs/NAVIGATION_RECOVERY.md).

Validation: `node --test tests/navigation-session.test.cjs`. Real-device lock/unlock and browser-discard verification remain required.
