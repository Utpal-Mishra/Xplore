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

### Decision engine
Consumes candidate routes + route features + contextual observations + user preferences.

Initial conceptual score:

```text
score(route) =
  w_time          * time_score
+ w_safety        * safety_score
+ w_accessibility * accessibility_score
+ w_environment   * environmental_score
+ w_health        * health_score
+ w_carbon        * carbon_score
+ w_cost          * cost_score
+ w_community     * community_score
```

Confidence is deliberately NOT hidden inside this utility score. It is returned separately so the product can communicate uncertainty.

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
