# XPLORE Architecture

## Design principles

1. Routing providers generate candidate paths; XPLORE decides which candidate best fits the user and context.
2. External observations are never treated as equally trustworthy. Provenance, freshness and confidence are first-class data.
3. Recommendations must be explainable.
4. Safety/accessibility claims require stronger evidence than convenience recommendations.
5. Location data is minimised by default.
6. Start modular; split into distributed services only when scale or team ownership requires it.

## Logical components

### Web/PWA client
Responsibilities:
- map rendering
- location consent
- origin/destination search
- route comparison
- context display
- route explanation
- community reporting
- offline shell/cache in later milestones

### XPLORE API
Provides a stable contract between clients and internal services.

Initial target endpoints:
- `POST /v1/routes`
- `GET /v1/journeys/{journey_id}`
- `GET /v1/areas/{area_id}/conditions`
- `POST /v1/community/reports`

### Routing adapter
Normalises one or more routing engines into an internal route-candidate schema. Provider-specific data must not leak throughout the application.

Candidate route fields:
- route_id
- mode
- geometry
- distance_m
- duration_s
- elevation_gain_m when available
- provider
- provider_metadata

### Context services
Adapters for weather, air quality, transport and community observations.

Normalised observation envelope:

```json
{
  "type": "precipitation",
  "value": 0.7,
  "unit": "mm_h",
  "location": {"lat": 0, "lon": 0},
  "observed_at": "ISO-8601",
  "retrieved_at": "ISO-8601",
  "source": "provider",
  "verification": "authoritative|corroborated|community|inferred",
  "confidence": 0.0,
  "expires_at": "ISO-8601"
}
```

### Live Mobility adapter

v0.7 adds a freshness-aware transport evidence layer between scheduled transit planning and the decision engine.

```text
GTFS_All scheduled candidates
  -> strict compatibility index from current GTFS_Realtime static feed
  -> server-side GTFS-Realtime snapshot
  -> freshness + exact-ID validation
  -> timing / vehicle / alert evidence
  -> transit reliability + reranking
```

Key rules:
- authenticated NTA requests happen server-side only
- broad scheduled coverage remains available even when realtime is unavailable
- realtime trip IDs are never fuzzy-matched
- an eligible join requires exact trip ID plus exact ordered stop sequence
- stale/unmatched live evidence cannot change the recommendation
- cancellations and infeasible live transfer gaps receive deterministic penalties/caps
- vehicle positions are map evidence, not route geometry
- the decision layer retains whether timing/reliability evidence is scheduled, part-live or live

The GitHub Actions snapshot is a beta backend adapter, not the final production service. A production XPLORE API should own polling, caching, schema validation, metrics, alert normalisation and provider failover.

### Evidence-gated Route Intelligence

v0.8 inserts an explicit validation step between sampled route context and the numeric road/path decision model.

```text
road/path candidates
  -> base five-component score
  -> candidate Route Intelligence sampling
  -> evidence tier
  -> mode-specific route-quality score
  -> confidence attenuation
  -> final score + reranking
```

Evidence quality and route quality are separate concepts. A high route-quality value cannot affect the XPLORE Score when the evidence tier is only Indicative.

The current scoring boundary is intentionally narrow:
- route-to-road coverage and sample count gate eligibility
- long routes receive reduced evidence influence
- lighting is used only when explicit tagging coverage is sufficient
- accessibility remains evidence-only and is never inferred from missing tags
- Route Intelligence maximum influence is preference-bounded between 8% and 20%
- when the context service fails, the candidate keeps its original score

This is an explainable decision-support model, not a safety/accessibility certification.

### Decision engine
Consumes candidate routes + route features + contextual observations + user preferences.

Current road/path pilot score:

```text
base(route) =
  w_time       * time
+ w_carbon     * carbon
+ w_health     * health_activity
+ w_comfort    * comfort
+ w_confidence * confidence

final(route) =
  base(route) * (1 - effective_route_intelligence_weight)
+ route_intelligence_quality * effective_route_intelligence_weight
```

The Route Intelligence weight is zero when the evidence gate fails. Accessibility is not part of the current numeric score. Journey confidence remains visible as its own user-facing metric even though the current pilot also includes a bounded confidence component inside the utility score.

### Learning and evaluation layer

v0.6 adds a privacy-first product-learning adapter around journey planning and guidance.

Responsibilities:
- record a coarse Search -> Results -> Guidance -> Arrival -> Feedback funnel
- capture structured route-quality feedback
- keep free text local by default
- exclude raw GPS, addresses, Eircodes, search text and place names from analytics events
- expose local export/clear controls
- support a future governed collector without embedding privileged credentials in the client

Analytics events use bucketed journey attributes (distance, duration, score and confidence) rather than precise location history. Structured feedback is product evidence only; it must not automatically become a safety/accessibility fact.

A production collector, when introduced, should sit behind the XPLORE API boundary and add schema validation, authentication, rate limiting, deletion controls and aggregate reporting.

### Explanation engine
Produces structured reasons, not generated marketing prose.

Example:

```json
{
  "recommended": true,
  "headline": "Best balance for your preferences",
  "tradeoffs": [
    {"metric": "time", "delta": "+3 min vs fastest"},
    {"metric": "cycling_protection", "value": "81%"},
    {"metric": "carbon", "delta": "-0.7 kg CO2e vs driving"}
  ]
}
```

An LLM may later verbalise this structure, but it must not invent route facts.

## Data model direction

Core spatial/domain entities:
- RoadSegment
- Place
- RouteCandidate
- Journey
- TransitStop
- AccessibilityFeature
- CommunityReport
- ContextObservation
- UserPreference
- SourceRegistry

PostgreSQL/PostGIS is the target persistence layer once the backend is introduced.

## Enterprise controls

Every recommendation should eventually be reproducible from:
- route-provider response/version
- relevant context observations
- decision-engine version
- preference weights
- emissions-factor version
- timestamp

This enables debugging, auditability and regression testing without retaining unnecessary personal location history.
