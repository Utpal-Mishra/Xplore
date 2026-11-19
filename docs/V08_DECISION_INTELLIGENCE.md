# XPLORE v0.8 — Decision Intelligence

XPLORE v0.8 moves Route Segment Intelligence from a display-only layer into the recommendation model, but only when its evidence quality is sufficient.

## Objective

Previous releases displayed sampled OpenStreetMap route context without allowing it to change the XPLORE Score.

v0.8 adds an explicit evidence gate:

```text
Route candidate
  -> sampled route context
  -> route-to-road match quality
  -> sample-count / route-length validation
  -> mode-specific Route Intelligence score
  -> confidence attenuation
  -> XPLORE score integration
  -> final reranking + explanation
```

A candidate that does not pass the gate keeps its original five-component score.

## Evidence tiers

### High

Requirements:

- at least 10 samples
- road-match rate >= 82%
- route length <= 30 km

Influence factor: 1.00 of the configured Route Intelligence weight.

### Medium

Standard route:

- at least 10 samples
- road-match rate >= 70%
- route length <= 50 km

Influence factor: 0.55.

Long route:

- at least 8 samples
- road-match rate >= 78%
- route length > 50 km

Influence factor: 0.45.

### Indicative

Anything below those thresholds.

Influence factor: 0. Route Intelligence remains visible but cannot alter ranking.

## Preference-specific maximum weights

The Route Intelligence component is deliberately bounded.

- Balanced: 12%
- Greenest: 8%
- Healthiest: 13%
- Calmest: 20%

The effective weight is:

```text
configured preference weight × evidence factor
```

All existing five score dimensions are proportionally scaled down so effective weights still sum to 100%.

## Mode-specific Route Intelligence

### Cycling

Uses:

- protected / segregated cycling context
- general cycling context
- green proximity
- lower major-road exposure
- lighting only when mapped lighting coverage is sufficient

### Walking

Uses:

- mapped foot / sidewalk support
- green proximity
- lower major-road exposure
- lighting only when mapped lighting coverage is sufficient

### Driving

Uses:

- lower major-road exposure
- green proximity
- lighting only when mapped lighting coverage is sufficient

These are contextual route-quality signals, not a safety assessment.

## Lighting evidence rule

Lighting only enters route quality when:

- at least 50% of matched road samples have explicit lighting tags
- a numeric lit=yes percentage is available

Sparse or missing lighting tags are treated as unknown, not unlit.

## Accessibility boundary

Accessibility remains evidence-only in v0.8.

XPLORE can display:

- positive mapped wheelchair / lowered-kerb / tactile-paving / elevator observations
- mapped concerns such as wheelchair=no, steps or raised kerbs

But these observations do **not** alter the XPLORE Score.

Reason: missing OpenStreetMap accessibility tags cannot be interpreted as evidence that a location or route is inaccessible.

## Candidate processing order

v0.8 changes road/path planning from:

```text
fetch routes -> score -> render -> analyse selected route
```

to:

```text
fetch routes + context
  -> compute base score
  -> analyse every candidate
  -> apply evidence gate
  -> integrate eligible Route Intelligence
  -> rerank
  -> render final candidates
```

This means the Recommended route can genuinely change because of validated route context.

## Failure behaviour

If Route Intelligence cannot be retrieved or validated:

- routing still succeeds
- the original base score remains
- no fabricated route-quality value is inserted
- UI explains that evidence is unavailable or below threshold

## Explanation layer

Decision Intelligence and Score Rationale now show:

- whether Route Intelligence was included
- evidence tier
- effective weight
- route-quality score
- resulting score delta
- accessibility evidence boundary

The old pre-v0.8 weights are not shown after Route Intelligence changes the score. Displayed weights reflect the actual effective model.

## Validation

Automated tests cover:

- high / medium / indicative evidence tiers
- long-route attenuation
- lighting coverage threshold
- cycling route quality
- walking route quality
- accessibility exclusion from score
- preference-specific maximum weights
- blended score behaviour
- module load order
- candidate analysis before final ranking
- explicit v0.8 UI boundary text

This is evidence-quality validation, not a claim of ground-truth safety validation. Field/ground-truth validation remains a future research requirement before XPLORE makes safety-critical claims.
