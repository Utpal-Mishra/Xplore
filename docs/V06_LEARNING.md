# XPLORE v0.6 — Learn

XPLORE v0.6 adds a privacy-first learning layer around the existing Ireland journey-planning and navigation experience.

## Goals

v0.6 is designed to answer five product questions without collecting unnecessary location history:

1. Are people successfully getting from search to a usable route result?
2. Do they start guidance after seeing XPLORE's recommendation?
3. Do guided journeys reach the arrival state?
4. Do users consider the recommendation good, acceptable or poor?
5. Which route-quality problems occur most often?

## User experience

Once a road or transit recommendation exists, XPLORE exposes a compact **Journey Feedback** control. The detailed form stays collapsed during normal planning/navigation.

The form captures:

- Good / Okay / Poor route rating
- destination correctness: Yes / No / Unsure
- route-quality issue codes:
  - wrong destination
  - route quality
  - ETA
  - missing/map data
  - safety
  - accessibility
  - transit
  - other
- whether the user would choose XPLORE's recommendation over simply taking the fastest route
- optional free-text note

For driving, cycling and walking, the form can prompt after arrival or after a meaningful guidance session is stopped. Transit v1 can be rated after an itinerary has been generated because transit turn-by-turn guidance is not yet implemented.

## Local analytics funnel

The browser records a rolling 30-day local funnel:

```text
journey_search_started
  -> journey_results_ready
  -> guidance_started
  -> journey_arrived
  -> feedback_submitted
```

Additional non-identifying events cover:

- app load
- address confirmation provider class
- travel-mode selection
- preference selection
- candidate selection
- feedback opening
- empty/error route searches
- guidance stopped

The in-app Learning panel shows local counts for Searches, Results, Guidance, Arrivals and Feedback.

## Privacy contract

The v0.6 event pipeline intentionally excludes:

- raw latitude/longitude
- GPS coordinates
- typed addresses
- Eircodes
- destination or origin names
- search query text
- free-text feedback notes

Journey properties are coarsened before analytics storage:

- distance buckets: <1 km, 1–5 km, 5–20 km, 20–50 km, 50 km+
- duration buckets: <15 min, 15–30 min, 30–60 min, 1–2 h, 2 h+
- score/confidence bands
- candidate count and selected rank
- mode and preference
- transfer count for transit
- Route Intelligence confidence label

`learning-core.js` owns these sanitisation rules and is shared by browser code and Node regression tests.

## Storage and retention

- Events: browser `localStorage`
- Feedback: browser `localStorage`
- Session identifier: browser `sessionStorage`
- Retention: 30 days
- Event cap: 400 retained records
- No account is required
- Clearing browser storage removes the local learning record

The user can export their own local dataset as JSON. A user-initiated export can include optional free-text notes because the user is explicitly exporting their own device data.

## Remote analytics boundary

There is **no remote collector configured in v0.6 by default**.

The browser supports an optional future `window.XPLORE_LEARNING_ENDPOINT` contract. If a governed endpoint is configured, anonymous sharing remains opt-in and the shared payload excludes free text and location-identifying fields.

A production collector should add:

- authenticated ingestion
- rate limiting
- schema validation
- origin controls
- short retention
- aggregate reporting
- deletion controls
- privacy notice/versioning
- abuse prevention

The static GitHub Pages application must not contain privileged analytics credentials.

## Route-quality reporting

Feedback is attached only to a coarse journey snapshot. It can be used to study:

- poor-result rate by mode
- wrong-destination rate
- ETA complaints
- safety/accessibility complaint frequency
- transit issue frequency
- recommendation preference vs fastest-route behaviour
- feedback rate after guidance

It is **not** sufficient evidence by itself to label a route safe, accessible or unsafe. Those claims require corroborated route/context data.

## Validation

Automated coverage:

- `tests/learning-core.test.cjs`
- `node --check learning-core.js`
- `node --check learning-v06.js`
- full `node --test tests/*.test.cjs`

CI workflow:

- `.github/workflows/quality-gates.yml`

Physical-device validation is still required for:

- post-arrival prompt placement
- mobile bottom-sheet behaviour
- form usability while returning from Guidance
- browser storage disabled/private-mode behaviour
- long-session retention and export
- transit feedback flow

## Next release

v0.7 should focus on **Live Mobility**:

1. XPLORE-controlled NTA GTFS-Realtime adapter
2. live bus arrivals and trip updates
3. service alerts
4. stronger Irish Rail realtime integration
5. realtime reliability signals in the XPLORE decision layer
