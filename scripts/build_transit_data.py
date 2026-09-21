#!/usr/bin/env python3
"""Build compact daily XPLORE transit data from the official NTA GTFS feed.

Output schema:
  manifest.json
  stops.json: {stop_id: [name, lat, lon, parent_station_or_empty]}
  trips.json: [[trip_id, route_short, route_long, mode, headsign,
                [[stop_id, arrival_seconds, departure_seconds], ...]], ...]

The daily GitHub Action downloads the national GTFS feed once, filters it to services
active for the current Europe/Dublin service date, and publishes only the compact data
needed by the browser planner.
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
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

GTFS_URL = os.environ.get(
    "XPLORE_GTFS_URL",
    "https://www.transportforireland.ie/transitData/Data/GTFS_All.zip",
)
OUT = Path(os.environ.get("XPLORE_TRANSIT_OUT", "data/transit"))
DUBLIN = ZoneInfo("Europe/Dublin")


@contextmanager
def csv_rows(zf: zipfile.ZipFile, name: str):
    """Yield a DictReader over one GTFS text member without materialising all rows."""
    try:
        binary = zf.open(name)
    except KeyError:
        yield iter(())
        return
    with binary:
        text = io.TextIOWrapper(binary, encoding="utf-8-sig", errors="replace", newline="")
        yield csv.DictReader(text)


def gtfs_seconds(value: str) -> int | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        h, m, s = [int(x) for x in value.split(":")]
        return h * 3600 + m * 60 + s
    except Exception:
        return None


def route_mode(route_type: str) -> str:
    try:
        value = int(route_type or 3)
    except ValueError:
        value = 3
    if value in {0, 900, 901, 902, 903, 904, 905, 906}:
        return "tram"
    if value in {1, 400, 401, 402, 403, 404, 405}:
        return "subway"
    if value == 2 or 100 <= value < 200:
        return "rail"
    if value == 4 or 1000 <= value < 1100:
        return "ferry"
    return "bus"


def active_services(zf: zipfile.ZipFile, today: datetime) -> set[str]:
    date_key = today.strftime("%Y%m%d")
    weekday = today.strftime("%A").lower()
    active: set[str] = set()

    with csv_rows(zf, "calendar.txt") as rows:
        for row in rows:
            service = row.get("service_id", "")
            if not service or row.get(weekday) != "1":
                continue
            start, end = row.get("start_date", ""), row.get("end_date", "")
            if start and date_key < start:
                continue
            if end and date_key > end:
                continue
            active.add(service)

    with csv_rows(zf, "calendar_dates.txt") as rows:
        for row in rows:
            if row.get("date") != date_key:
                continue
            service = row.get("service_id", "")
            if row.get("exception_type") == "1":
                active.add(service)
            elif row.get("exception_type") == "2":
                active.discard(service)

    if not active:
        raise RuntimeError(f"No active GTFS service IDs were found for {date_key}")
    return active


def download_gtfs() -> bytes:
    request = urllib.request.Request(
        GTFS_URL,
        headers={"User-Agent": "XPLORE-transit-builder/0.5 (+https://github.com/Utpal-Mishra/Xplore)"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def main() -> int:
    now = datetime.now(DUBLIN)
    service_date = now.strftime("%Y-%m-%d")
    print(f"Downloading NTA GTFS from {GTFS_URL}")
    blob = download_gtfs()
    print(f"Downloaded {len(blob):,} bytes")

    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        required = {"routes.txt", "trips.txt", "stops.txt", "stop_times.txt"}
        missing = required.difference(zf.namelist())
        if missing:
            raise RuntimeError(f"Required GTFS members missing: {sorted(missing)}")

        active = active_services(zf, now)

        route_map: dict[str, tuple[str, str, str]] = {}
        with csv_rows(zf, "routes.txt") as rows:
            for row in rows:
                route_id = row.get("route_id", "")
                if route_id:
                    route_map[route_id] = (
                        row.get("route_short_name", "").strip(),
                        row.get("route_long_name", "").strip(),
                        route_mode(row.get("route_type", "3")),
                    )

        active_trips: dict[str, tuple[str, str, str, str]] = {}
        with csv_rows(zf, "trips.txt") as rows:
            for row in rows:
                trip_id = row.get("trip_id", "")
                if not trip_id or row.get("service_id") not in active:
                    continue
                short, long, mode = route_map.get(row.get("route_id", ""), ("", "", "bus"))
                active_trips[trip_id] = (
                    short,
                    long,
                    mode,
                    row.get("trip_headsign", "").strip(),
                )

        if not active_trips:
            raise RuntimeError(f"No active trips were found for {service_date}")

        stop_times_by_trip: dict[str, list[tuple[int, str, int, int]]] = defaultdict(list)
        used_stop_ids: set[str] = set()
        with csv_rows(zf, "stop_times.txt") as rows:
            for row in rows:
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

        stop_lookup: dict[str, list] = {}
        with csv_rows(zf, "stops.txt") as rows:
            for row in rows:
                stop_id = row.get("stop_id", "")
                if stop_id not in used_stop_ids:
                    continue
                try:
                    lat = round(float(row.get("stop_lat", "")), 6)
                    lon = round(float(row.get("stop_lon", "")), 6)
                except (TypeError, ValueError):
                    continue
                stop_lookup[stop_id] = [
                    row.get("stop_name", "").strip() or stop_id,
                    lat,
                    lon,
                    row.get("parent_station", "").strip(),
                ]

    valid_stop_ids = set(stop_lookup)
    compact_trips = []
    for trip_id, meta in active_trips.items():
        rows = sorted(stop_times_by_trip.get(trip_id, []), key=lambda x: x[0])
        compact_stops = [[stop_id, arr, dep] for _, stop_id, arr, dep in rows if stop_id in valid_stop_ids]
        if len(compact_stops) < 2:
            continue
        short, long, mode, headsign = meta
        compact_trips.append([trip_id, short, long, mode, headsign, compact_stops])

    if not compact_trips or not stop_lookup:
        raise RuntimeError("The compact daily transit dataset would be empty; refusing to publish it")

    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": "1",
        "available": True,
        "source": "National Transport Authority GTFS",
        "sourceUrl": GTFS_URL,
        "license": "CC BY 4.0",
        "serviceDate": service_date,
        "generatedAt": now.isoformat(timespec="seconds"),
        "stopCount": len(stop_lookup),
        "tripCount": len(compact_trips),
        "coverage": "Ireland scheduled public transport",
        "realtime": {
            "bus": "NTA GTFS-Realtime requires API key; not embedded in static client",
            "rail": "Irish Rail public realtime queried client-side when available",
        },
    }

    json_options = dict(ensure_ascii=False, separators=(",", ":"))
    (OUT / "manifest.json").write_text(json.dumps(manifest, **json_options), encoding="utf-8")
    (OUT / "stops.json").write_text(json.dumps(stop_lookup, **json_options), encoding="utf-8")
    (OUT / "trips.json").write_text(json.dumps(compact_trips, **json_options), encoding="utf-8")

    print(f"Published {len(stop_lookup):,} stops and {len(compact_trips):,} active trips for {service_date}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Transit build failed: {exc}", file=sys.stderr)
        raise
