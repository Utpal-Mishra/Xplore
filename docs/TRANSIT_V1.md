# XPLORE Transit v1

XPLORE v0.5 introduces scheduled public-transport journey planning for Ireland.

## Data sources

- **NTA GTFS (official, CC BY 4.0):** daily national schedules, stops, routes and trips.
- **Irish Rail realtime:** best-effort live departure context for selected rail itineraries.
- **NTA GTFS-Realtime:** architecturally planned but not called from the static GitHub Pages client because production access requires API tokens. Those tokens must not be embedded in browser JavaScript.

## Build pipeline

`.github/workflows/update-transit-data.yml` runs daily and downloads the official NTA `GTFS_All.zip` feed. `scripts/build_transit_data.py` filters the national feed to the current Europe/Dublin service date and publishes compact browser data under `data/transit/`.

The browser therefore does not need to download or parse the full national GTFS archive.

## Transit planner

Transit v1:

1. Uses XPLORE's confirmed Start and Destination coordinates.
2. Finds nearby scheduled public-transport stops.
3. Searches same-day direct itineraries.
4. Searches one-transfer itineraries.
5. Includes estimated access and egress walking.
6. Scores candidates using door-to-door time, indicative carbon, active walking, transfer comfort and schedule confidence.
7. Draws the selected stop sequence on the map.
8. Queries Irish Rail realtime when a selected itinerary contains a rail leg and the browser can access the endpoint.

## Current limitations

- Bus realtime is not yet included in route scoring.
- NTA GTFS-Realtime must be proxied through an XPLORE-controlled backend so credentials are not exposed in the browser.
- Transit v1 supports direct and one-transfer journeys, not an unrestricted network-wide RAPTOR/CSA implementation.
- Map lines follow the scheduled stop sequence, not official GTFS shape geometry yet.
- Fare calculation and Leap fare caps are not included yet.
- Transit turn-by-turn/stop-by-stop guidance is a later iteration.

## Next transit iteration

1. Server-side NTA GTFS-Realtime ingestion with 60-second compliant caching.
2. Vehicle positions, trip updates and service alerts.
3. GTFS shapes for exact bus/train geometry.
4. Multi-transfer RAPTOR/CSA journey planning.
5. Fare and Leap-card comparison.
6. Disruption-aware rerouting and missed-connection recovery.
7. Transit accessibility and step-free interchange data.
