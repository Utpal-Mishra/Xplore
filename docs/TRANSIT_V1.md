# XPLORE Transit — v0.5 Schedule Planner + v0.7 Live Mobility

XPLORE's transit layer separates **journey planning** from **realtime evidence**.

Scheduled public transport is the universal baseline. v0.7 enriches only those scheduled legs that can be proven to correspond to the current NTA realtime schedule generation.

## Data sources

### Broad scheduled planning

`GTFS_All.zip`

Used for Ireland-wide stops, routes/trips, service calendars, scheduled stop times, and direct/one-transfer candidate generation.

### Realtime compatibility

`GTFS_Realtime.zip`

Used only to prove which broad scheduled trips are safe to join to the current NTA GTFS-Realtime v2 generation.

A trip is eligible only when both conditions hold:

1. exact `trip_id` match
2. exact complete ordered `stop_id` sequence match

No fuzzy live join by route label, headsign, town or approximate time is permitted.

### NTA GTFS-Realtime v2

The server-side snapshot can provide:
- trip updates / delays
- schedule relationships including cancellations
- vehicle positions
- service alerts

The NTA API credential remains server-side.

### Irish Rail realtime

The public Irish Rail realtime API remains a rail fallback/cross-check for selected rail itineraries.

## Daily schedule pipeline

`.github/workflows/update-transit-data.yml` runs daily.

`scripts/build_transit_data.py`:

1. downloads `GTFS_All.zip`
2. filters to the current Europe/Dublin service date
3. publishes compact stops/trips for browser planning
4. downloads the current realtime-compatible static GTFS
5. builds `realtime_eligible.json` using the strict join
6. publishes compatibility counts in `manifest.json`

Outputs:

- `data/transit/manifest.json`
- `data/transit/stops.json`
- `data/transit/trips.json`
- `data/transit/realtime_eligible.json`

If the realtime-compatible static feed is unavailable, scheduled planning still publishes; realtime eligibility becomes empty.

## Scheduled planner

The browser:

1. uses confirmed Start/Destination coordinates
2. finds nearby stops
3. searches direct itineraries
4. searches one-transfer itineraries
5. includes estimated access/egress walking
6. calculates time/carbon/activity/transfer/schedule components
7. produces an explainable XPLORE score
8. draws stop sequence and walking connectors

## v0.7 realtime snapshot

`.github/workflows/refresh-live-mobility.yml` is designed for a five-minute refresh.

When secret `NTA_GTFS_RT_API_KEY` is configured, it:

1. checks out current `main`
2. fetches one combined NTA GTFS-Realtime v2 feed
3. filters entities to today's strict-compatible trips
4. validates source freshness
5. writes browser-safe compact JSON
6. deploys the site plus snapshot to GitHub Pages

Outputs:

- `data/realtime/manifest.json`
- `data/realtime/feed.json`

The public browser never receives the NTA API key.

## Realtime decision logic

Fresh exact-match live evidence can update:

- boarding delay
- alighting delay
- effective departure/arrival
- effective total journey duration
- transit reliability
- transfer margin
- cancellation state
- route-specific alert severity
- candidate ranking

For a one-transfer journey:

```text
live gap =
  (next scheduled departure + next departure delay)
  -
  (first scheduled arrival + first arrival delay)
```

A negative gap means the connection is already infeasible under the current evidence.

## Freshness

Client thresholds:

- <= 7 min: Live
- >7 to <=12 min: Aging but usable with reliability penalty
- >12 min: Stale; schedule only

The snapshot builder also rejects source feeds older than 15 minutes.

## Candidate labels

Transit results can display:

- **Scheduled** — no fresh exact live match
- **Part-live** — only some legs have exact live data
- **Live** — every transit leg has an exact live update
- **Cancelled** — a relevant trip/stop relationship is cancelled/skipped

These labels describe the evidence available to XPLORE, not a guarantee that the operator will perform exactly as predicted.

## Vehicle positions

A selected compatible trip can show its matched NTA vehicle position on the map.

Vehicle position is informational and never replaces route geometry.

## Alerts

A route-specific alert is associated only through exact trip, route or relevant stop identifiers.

Network-wide/unscoped alerts can be retained as feed evidence but are not used to penalise a particular candidate automatically.

## Failure policy

Scheduled data wins whenever realtime cannot be proven trustworthy.

Fallback triggers include:
- unconfigured key
- refresh failure
- stale snapshot
- incompatible static generation
- trip mismatch
- stop-sequence mismatch
- missing live update
- malformed data

## Remaining transit work

- activate/validate the NTA production key
- exact GTFS Shapes geometry
- multi-transfer RAPTOR/CSA planning
- fare/Leap comparison
- stop-by-stop transit guidance
- disruption-aware journey replanning
- stronger station/vehicle accessibility evidence
