# XPLORE v0.2 — Cork Real-World Pilot

## Product objective

Move XPLORE from a UI concept to a context-aware navigation product. The first milestone is one genuinely useful Cork journey using a real map, real origin/destination, real routing and contextual signals.

## Product promise

Google Maps answers: How do I get there?

XPLORE should answer: What is the best journey for me, given my preferences and what is happening around me right now — and why?

## Core intelligence layers

1. Route intelligence — time, distance, mode and alternatives.
2. Environmental intelligence — weather, precipitation, wind and air quality.
3. Community intelligence — hazards, accessibility issues, closures and local observations.
4. Impact intelligence — carbon, active minutes, health and cost.
5. Confidence intelligence — freshness, source quality, verification and reliability.
6. Personalisation — user-weighted safety, accessibility, sustainability, comfort, time and cost.

## v0.2 delivery sequence

### P0 — Foundation
- Resolve GitHub Pages/CI deployment.
- Separate frontend logic from data/services.
- Add development, staging and production conventions.
- Add automated smoke tests.
- Add structured logging and basic error handling.

### P1 — Real map
- Replace the illustrative map with an OpenStreetMap-based interactive map.
- Support current location with explicit consent.
- Add origin/destination markers.
- Add geocoding/search.
- Render route geometry and fit map bounds automatically.

### P2 — Real routing
- Integrate an established routing engine rather than building graph search from scratch.
- Support walking, cycling and driving first.
- Return multiple candidate routes.
- Store route distance, duration and geometry separately from XPLORE scoring.

### P3 — XPLORE Route Score
Candidate routes are scored independently from the routing provider.

Initial dimensions:
- travel time
- safety
- accessibility
- environmental comfort
- carbon
- active travel/health
- cost
- community conditions
- route confidence

Every recommendation must expose its factors rather than returning an unexplained score.

### P4 — Live context
- Weather and precipitation.
- Wind, particularly for cycling/walking.
- Air quality.
- Public-transport context when reliable Cork feeds are available.
- Temporary community hazards.

Context must influence recommendations, not exist only as map overlays.

### P5 — Journey Confidence
Every external/context observation should carry:
- source
- observed/retrieved timestamp
- freshness
- geographic precision
- verification state
- expiry
- confidence

The UI should distinguish scheduled, observed and inferred information.

### P6 — Community Truth
Lifecycle:
Reported → corroborated → verified → routing eligible → expired.

Community submissions must never immediately alter safety-critical routing without appropriate corroboration.

### P7 — Explainable recommendations
Each route card should answer "Why this route?"

Example:
- XPLORE Recommended — 24 min
- +3 min vs fastest
- 81% protected cycling
- lower traffic exposure
- lower noise
- 0.7 kg CO2e avoided
- confidence 91%

### P8 — Privacy and accessibility
- Private Journey Mode.
- Minimise retained precise location data.
- Explicit consent for current location.
- User-controlled history.
- Accessibility preferences beyond a binary wheelchair flag: steps, gradient, surface, kerbs, lifts and path width as data becomes available.

## Architecture direction

```text
Client / PWA
    |
XPLORE API
    |
+----------------------+-----------------------+
| Routing Adapter      | Context Services      |
|                      | weather / AQI / etc.  |
+----------------------+-----------------------+
    |                          |
Route candidates         Context observations
    \                          /
     \                        /
        XPLORE Decision Engine
                 |
      score + confidence + explanation
                 |
            Journey result
```

Future persistence should use PostgreSQL/PostGIS for spatial entities. Introduce streaming infrastructure only when real-time volume requires it.

## Enterprise-readiness gates

XPLORE should not be called enterprise-ready until these are measurable:

- CI/CD with protected production deployment.
- Automated unit, integration, routing-regression and smoke tests.
- API authentication/authorisation and rate limiting.
- Secrets management and dependency/security scanning.
- Consent, retention, export and deletion controls for personal/location data.
- Auditability of route/context inputs and recommendation outputs.
- Monitoring, tracing, alerts, backup and recovery procedures.
- Defined SLOs for routing availability and latency.
- Versioned APIs and data contracts.
- Data provenance/freshness/confidence model.
- Documented incident and community-moderation workflows.

## Cork acceptance journeys

Use a stable regression suite around representative Cork journeys, including:
- Cork city centre ↔ UCC
- Kent Station ↔ UCC
- Cork Airport ↔ city centre
- Cork University Hospital ↔ city centre

A release should fail validation if a known journey becomes implausible or materially worse without an explainable data change.

## Definition of done for v0.2

A user can select two real Cork locations and receive at least two genuine route alternatives on a real map. XPLORE recommends one using contextual factors, displays sustainability/health information, shows a confidence indicator, and explains why it preferred that route over the fastest alternative.
