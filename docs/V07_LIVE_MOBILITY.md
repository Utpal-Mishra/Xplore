# XPLORE v0.7 — Live Mobility

XPLORE v0.7 adds a realtime decision layer to scheduled public transport while preserving scheduled fallback.

## Product objective

The release answers a practical question that v0.5 could not:

> Is the recommended bus/train journey still a good choice **right now**?

Fresh realtime evidence can now change:

- expected timing shown to the user
- transit reliability component
- transfer / missed-connection risk
- candidate ranking
- selected-journey explanation
- route-specific disruption context
- map context through matched live vehicle positions

Realtime never overrides schedule when the join is uncertain or the feed is stale.

## Official data model

XPLORE uses three related NTA data products:

1. `GTFS_All.zip` — broad scheduled Ireland coverage used for journey planning.
2. `GTFS_Realtime.zip` — the static generation compatible with NTA GTFS-Realtime v2.
3. NTA GTFS-Realtime v2 — live trip updates, vehicle positions and alerts.

The NTA states that realtime IDs must be matched against the corresponding static schedule generation and should not be assumed stable across schedule generations.

## Strict compatibility index

The daily transit build now downloads both static datasets.

A scheduled trip becomes realtime-eligible only when:

```text
GTFS_All trip_id == GTFS_Realtime trip_id
AND
ordered GTFS_All stop_id sequence == ordered GTFS_Realtime stop_id sequence
```

No route-name, destination-name or approximate-time fuzzy join is used.

Output:

`data/transit/realtime_eligible.json`

If the compatible static feed is unavailable, scheduled planning still publishes successfully but realtime eligibility is empty.

## Server-side realtime snapshot

`scripts/build_realtime_snapshot.py` reads the NTA key from:

`NTA_GTFS_RT_API_KEY`

The key is never written into the repository, generated JSON or browser application.

Default endpoint:

`https://api.nationaltransport.ie/gtfsr/v2/gtfsr`

The endpoint can be overridden with repository variable:

`XPLORE_NTA_GTFS_RT_URL`

The snapshot builder makes **one request per invocation** and deliberately has no immediate retry loop, respecting NTA's 60-second fair-use spacing requirement.

Only realtime entities matching the strict compatibility index are retained.

Published browser-safe output:

- `data/realtime/manifest.json`
- `data/realtime/feed.json`

## Refresh cadence

`.github/workflows/refresh-live-mobility.yml` runs every five minutes.

When the NTA secret is configured:

1. checkout current `main`
2. install the pinned GTFS-Realtime decoder
3. fetch one NTA combined realtime feed
4. validate feed freshness
5. build the compact browser snapshot
6. deploy the current site + new snapshot to GitHub Pages

A failed/stale fetch aborts that refresh instead of replacing the last successfully deployed snapshot.

When the NTA key is not configured, scheduled refresh does not redeploy Pages and the browser shows an explicit scheduled-data fallback.

## Freshness policy

Client policy:

- **Live:** snapshot/source age <= 7 minutes
- **Aging but usable:** > 7 and <= 12 minutes
- **Stale:** > 12 minutes

Stale snapshots do not influence transit ranking.

The server also rejects source feeds older than 15 minutes before deployment.

## Trip updates

For each compatible transit leg XPLORE can use:

- departure delay at boarding stop
- arrival delay at alighting stop
- trip schedule relationship
- stop schedule relationship

Absolute GTFS-Realtime timestamps are converted back into Europe/Dublin service-day seconds against the exact scheduled stop time. GTFS delay values are used when absolute time is not available.

## Connection risk

For one-transfer journeys:

```text
live transfer gap =
  (next scheduled departure + next departure delay)
  -
  (first scheduled arrival + first arrival delay)
```

Decision handling:

- negative gap -> likely missed connection, score capped
- < 2 min -> severe connection-risk penalty
- 2–4 min -> tight-connection penalty
- larger gap -> no transfer-risk penalty

## Cancellations

A trip or relevant boarding/alighting stop marked cancelled/skipped cannot remain a high-ranked recommendation.

Cancelled candidate reliability is forced to a low value and total XPLORE score is capped.

The itinerary remains visible so the user can understand why another option is now recommended.

## Vehicle positions

When a selected trip has an exact matched vehicle position, XPLORE adds a live vehicle marker to the map.

The marker is informational. Vehicle GPS does not alter the route geometry.

## Service alerts

Route-specific alerts are matched only through exact:

- trip ID
- route ID
- boarding stop ID
- alighting stop ID

Unscoped/network-wide alerts may be retained in the feed but do not directly penalise a specific itinerary.

Alert effects are grouped into informational, warning and severe decision signals.

## Reliability scoring

Scheduled reliability remains the fallback.

When realtime coverage exists, reliability considers:

- realtime leg coverage
- vehicle-position coverage
- maximum observed delay
- transfer margin
- cancellation state
- feed freshness
- relevant alert severity

Realtime reliability then replaces the scheduled reliability component in the existing transit XPLORE score.

## Irish Rail

The public Irish Rail realtime web service remains a rail fallback/cross-check.

NTA GTFS-Realtime v2 is the primary cross-mode live layer when a strict match exists. Irish Rail does not silently overwrite a matched NTA result.

## Failure behaviour

Any of the following falls back to scheduled transit:

- no NTA key
- realtime workflow failure
- stale snapshot
- schedule-generation mismatch
- trip ID mismatch
- stop-sequence mismatch
- missing trip update
- malformed snapshot

Road routing, address search and scheduled public transport remain independent of the realtime adapter.

## Validation

Automated:

- `tests/realtime-core.test.cjs`
- live/stale freshness thresholds
- delay extraction
- connection-gap calculations
- cancellation penalty
- exact alert matching
- alert severity
- delay labels
- browser JavaScript syntax
- both transit Python builders compile

CI:

`.github/workflows/quality-gates.yml`

## Remaining acceptance work

- confirm NTA production API secret in repository settings
- verify first successful v0.7 snapshot against the NTA portal
- compare several live journeys against TFI/Irish Rail user-facing information
- verify mobile live badges and vehicle markers on a physical device
- observe 24-hour scheduled workflow stability
- measure realtime exact-match coverage after daily static refresh

## v0.8 handoff

v0.8 should focus on validated Decision Intelligence:

- route-segment validation corpus
- Route Intelligence integration into XPLORE Score
- evidence-quality thresholds for greenery/cycling/accessibility
- stronger uncertainty/explanation controls
