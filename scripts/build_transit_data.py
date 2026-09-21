#!/usr/bin/env python3
"""Build compact daily XPLORE transit data from the official NTA GTFS feed.

Output schema is intentionally browser-friendly:
  manifest.json
  stops.json: {stop_id: [name, lat, lon, parent_station_or_empty]}
  trips.json: [[trip_id, route_short, route_long, mode, headsign,
                [[stop_id, arrival_seconds, departure_seconds], ...]], ...]

The GitHub Action refreshes this once per day. The browser never needs to download
or parse the full national GTFS ZIP.
"""

from __future__ import annotations

import csv
import io
import json
import os
import sys
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

GTFS_URL = os.environ.get(
    "XPLORE_GTFS_URL",
    "https://www.transportforireland.ie/transitData/Data/GTFS_All.zip",
)
OUT = Path(os.environ.get("XPLORE_TRANSIT_OUT", "data/transit"))
DUBLIN = ZoneInfo("Europe/Dublin")


def read_csv(zf: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    try:
        raw = zf.read(name)
    except KeyError:
        return []
    text = raw.decode("utf-8-sig", errors="replace")
    return list(csv.DictReader(io.StringIO(text)))


def parse_yyyymmdd(value: str) -> str:
    value = (value or "").strip()
    if len(value) != 8:
        return value
    return f"{value[:4]}-{value[4:6]}-{value[6:8]}"


def gtfs_seconds(value: str) -> int | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        h, m, s = [int(x) for x in value.split(":")]
        return h * 3600 + m * 60 + s
    except Exception:
        return None


def active_services(calendar, exceptions, today: datetime) -> set[str]:
    date_key = today.strftime("%Y%m%d")
    weekday = today.strftime("%A").lower()
    active: set[str] = set()

    for row in calendar:
        service = row.get("service_id", "")
        if not service:
            continue
        if row.get(weekday) != "1":
            continue
        start = row.get("start_date", "")
        end = row.get("end_date", "")
        if start and date_key < start:
            continue
        if end and date_key > end:
            continue
        active.add(service)

    for row in exceptions:
        if row.get("date") != date_key:
            continue
        service = row.get("service_id", "")
        if row.get("exception_type") == "1":
            active.add(service)
        elif row.get("exception_type") == "2":
            active.discard(service)

    return active


def route_mode(route_type: str) -> str:
    try:
        value = int(route_type or 3)
    except ValueError:
        value = 3
    # Standard + extended GTFS route types are normalised to product-level modes.
    if value in {0, 900, 901, 902, 903, 904, 905, 906}:
        return "tram"
    if value in {1, 400, 401, 402, 403, 404, 405}:
        return "subway"
    if value == 2 or 100 <= value < 200:
        return "rail"
    if value == 4 or 1000 <= value < 1100:
        return "ferry"
    return "bus"


def download_gtfs() -> bytes:
    req = urllib.request.Request(
        GTFS_URL,
        headers={"User-Agent": "XPLORE-transit-builder/0.5 (+https://github.com/Utpal-Mishra/Xplore)"},
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()


def main() -> int:
    now = datetime.now(DUBLIN)
    service_date = now.strftime("%Y-%m-%d")
    print(f"Downloading NTA GTFS from {GTFS_URL}")
    blob = download_gtfs()
    print(f"Downloaded {len(blob):,} bytes")

    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        calendar = read_csv(zf, "calendar.txt")
        exceptions = read_csv(zf, "calendar_dates.txt")
        routes = read_csv(zf, "routes.txt")
        trips = read_csv(zf, "trips.txt")
        stops = read_csv(zf, "stops.txt")
        stop_times = read_csv(zf, "stop_times.txt")

    if not trips or not stops or not stop_times:
        raise RuntimeError("Required GTFS files are missing from the NTA feed")

    active = active_services(calendar, exceptions, now)
    if not active and not calendar:
        # Some feeds rely only on exceptions. If both calendar sources are absent,
        # do not silently publish a misleading empty dataset.
        raise RuntimeError("Could not determine active GTFS services for today")

    route_map = {
        row.get("route_id", ""): (
            row.get("route_short_name", "").strip(),
            row.get("route_long_name", "").strip(),
            route_mode(row.get("route_type", "3")),
        )
        for row in routes
        if row.get("route_id")
    }

    active_trips: dict[str, tuple[str, str, str, str]] = {}
    for row in trips:
        trip_id = row.get("trip_id", "")
        if not trip_id or row.get("service_id") not in active:
            continue
        short, long, mode = route_map.get(row.get("route_id", ""), ("", "", "bus"))
        # XPLORE Transit v1 focuses on scheduled shared transport.
        if mode not in {"bus", "rail", "tram", "subway", "ferry"}:
            continue
        active_trips[trip_id] = (short, long, mode, row.get("trip_headsign", "").strip())

    stop_times_by_trip: dict[str, list[tuple[int, str, int, int]]] = defaultdict(list)
    used_stop_ids: set[str] = set()
    for row in stop_times:
        trip_id = row.get("trip_id", "")
        if trip_id not in active_trips:
            continue
        stop_id = row.get("stop_id", "")
        if not stop_id:
            continue
        arr = gtfs_seconds(row.get("arrival_time", ""))
        dep = gtfs_seconds(row.get("departure_time", ""))
        if arr is None and dep is None:
            continue
        if arr is None:
            arr = dep
        if dep is None:
            dep = arr
        try:
            sequence = int(row.get("stop_sequence", "0") or 0)
        except ValueError:
            sequence = 0
        stop_times_by_trip[trip_id].append((sequence, stop_id, int(arr), int(dep)))
        used_stop_ids.add(stop_id)

    compact_trips = []
    for trip_id, meta in active_trips.items():
        rows = sorted(stop_times_by_trip.get(trip_id, []), key=lambda x: x[0])
        if len(rows) < 2:
            continue
        short, long, mode, headsign = meta
        compact_stops = [[stop_id, arr, dep] for _, stop_id, arr, dep in rows]
        compact_trips.append([trip_id, short, long, mode, headsign, compact_stops])

    stop_lookup = {row.get("stop_id", ""): row for row in stops if row.get("stop_id")}
    compact_stops = {}
    for stop_id in sorted(used_stop_ids):
        row = stop_lookup.get(stop_id)
        if not row:
            continue
        try:
            lat = round(float(row.get("stop_lat", "")), 6)
            lon = round(float(row.get("stop_lon", "")), 6)
        except (TypeError, ValueError):
            continue
        compact_stops[stop_id] = [
            row.get("stop_name", "").strip() or stop_id,
            lat,
            lon,
            row.get("parent_station", "").strip(),
        ]

    # Remove trips whose stop coordinates are unavailable after compaction.
    valid_stop_ids = set(compact_stops)
    cleaned_trips = []
    for trip in compact_trips:
        filtered = [entry for entry in trip[5] if entry[0] in valid_stop_ids]
        if len(filtered) >= 2:
            trip[5] = filtered
            cleaned_trips.append(trip)

    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": "1",
        "available": True,
        "source": "National Transport Authority GTFS",
        "sourceUrl": GTFS_URL,
        "license": "CC BY 4.0",
        "serviceDate": service_date,
        "generatedAt": now.isoformat(timespec="seconds"),
        "stopCount": len(compact_stops),
        "tripCount": len(cleaned_trips),
        "coverage": "Ireland scheduled public transport",
        "realtime": {
            "bus": "NTA GTFS-Realtime requires API key; not embedded in static client",
            "rail": "Irish Rail public realtime queried client-side when available",
        },
    }

    options = dict(ensure_ascii=False, separators=(",", ":"))
    (OUT / "manifest.json").write_text(json.dumps(manifest, **options), encoding="utf-8")
    (OUT / "stops.json").write_text(json.dumps(compact_stops, **options), encoding="utf-8")
    (OUT / "trips.json").write_text(json.dumps(cleaned_trips, **options), encoding="utf-8")

    print(f"Published {len(compact_stops):,} stops and {len(cleaned_trips):,} active trips for {service_date}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Transit build failed: {exc}", file=sys.stderr)
        raise
