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
