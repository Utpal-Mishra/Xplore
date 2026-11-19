#!/usr/bin/env python3
"""Build compact daily XPLORE transit data from official NTA GTFS feeds.

v0.9 outputs:
  manifest.json
  stops.json: {stop_id: [name, lat, lon, parent_station, zone_id]}
  trips.json: [[trip_id, route_short, route_long, mode, headsign,
                [[stop_id, arrival_seconds, departure_seconds], ...],
                route_id, shape_id, agency_id], ...]
  agencies.json: {agency_id: [agency_name, agency_url]}
  realtime_eligible.json
  shapes/00.json ... shapes/3f.json: {shape_id: encoded_polyline}

Shapes preserve the ordered GTFS shape points and are encoded using Google-style
polyline precision 5 for compact browser transport. They are sharded by a stable
FNV-1a hash so the browser only loads geometry required by selected itineraries.
"""

from __future__ import annotations

import csv
import io
import json
import os
import shutil
import sys
import urllib.request
import zipfile
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

GTFS_ALL_URL = os.environ.get(
    "XPLORE_GTFS_URL",
    "https://www.transportforireland.ie/transitData/Data/GTFS_All.zip",
)
GTFS_REALTIME_STATIC_URL = os.environ.get(
    "XPLORE_GTFS_REALTIME_STATIC_URL",
    "https://www.transportforireland.ie/transitData/Data/GTFS_Realtime.zip",
)
OUT = Path(os.environ.get("XPLORE_TRANSIT_OUT", "data/transit"))
SHAPE_SHARDS = int(os.environ.get("XPLORE_SHAPE_SHARDS", "64"))
DUBLIN = ZoneInfo("Europe/Dublin")
USER_AGENT = "XPLORE-transit-builder/0.9 (+https://github.com/Utpal-Mishra/Xplore)"


@contextmanager
def csv_rows(zf: zipfile.ZipFile, name: str):
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


def download(url: str, label: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    print(f"Downloading {label} from {url}")
    with urllib.request.urlopen(request, timeout=240) as response:
        blob = response.read()
    print(f"Downloaded {len(blob):,} bytes for {label}")
    return blob


def require_members(zf: zipfile.ZipFile, label: str) -> None:
    required = {"routes.txt", "trips.txt", "stops.txt", "stop_times.txt"}
    missing = required.difference(zf.namelist())
    if missing:
        raise RuntimeError(f"{label} required GTFS members missing: {sorted(missing)}")


def _encode_value(value: int) -> str:
    value = ~(value << 1) if value < 0 else value << 1
    chars = []
    while value >= 0x20:
        chars.append(chr((0x20 | (value & 0x1F)) + 63))
        value >>= 5
    chars.append(chr(value + 63))
    return "".join(chars)


def encode_polyline(points: list[tuple[float, float]], precision: int = 5) -> str:
    """Encode ordered (lat, lon) points without geometry simplification."""
    factor = 10**precision
    previous_lat = previous_lon = 0
    encoded = []
    for lat, lon in points:
        lat_i = int(round(lat * factor))
        lon_i = int(round(lon * factor))
        encoded.append(_encode_value(lat_i - previous_lat))
        encoded.append(_encode_value(lon_i - previous_lon))
        previous_lat, previous_lon = lat_i, lon_i
    return "".join(encoded)


def fnv1a_32(value: str) -> int:
    result = 0x811C9DC5
    for byte in value.encode("utf-8"):
        result ^= byte
        result = (result * 0x01000193) & 0xFFFFFFFF
    return result


def shape_shard(shape_id: str, shard_count: int = SHAPE_SHARDS) -> str:
    if shard_count <= 0 or shard_count & (shard_count - 1):
        raise ValueError("shape shard count must be a positive power of two")
    width = max(2, len(f"{shard_count - 1:x}"))
    return f"{fnv1a_32(shape_id) & (shard_count - 1):0{width}x}"


def realtime_trip_sequences(blob: bytes, today: datetime) -> dict[str, tuple[str, ...]]:
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        require_members(zf, "Realtime-compatible")
        active = active_services(zf, today)
        trip_ids: set[str] = set()
        with csv_rows(zf, "trips.txt") as rows:
            for row in rows:
                trip_id = row.get("trip_id", "")
                if trip_id and row.get("service_id") in active:
                    trip_ids.add(trip_id)
        by_trip: dict[str, list[tuple[int, str]]] = defaultdict(list)
        with csv_rows(zf, "stop_times.txt") as rows:
            for row in rows:
                trip_id = row.get("trip_id", "")
                if trip_id not in trip_ids:
                    continue
                stop_id = row.get("stop_id", "")
                if not stop_id:
                    continue
                try:
                    sequence = int(row.get("stop_sequence", "0") or 0)
                except ValueError:
                    sequence = 0
                by_trip[trip_id].append((sequence, stop_id))
    return {
        trip_id: tuple(stop for _, stop in sorted(rows, key=lambda x: x[0]))
        for trip_id, rows in by_trip.items()
        if len(rows) >= 2
    }


def build_active_shapes(zf: zipfile.ZipFile, active_shape_ids: set[str]) -> dict[str, str]:
    if not active_shape_ids or "shapes.txt" not in zf.namelist():
        return {}
    points: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    with csv_rows(zf, "shapes.txt") as rows:
        for row in rows:
            shape_id = row.get("shape_id", "")
            if shape_id not in active_shape_ids:
                continue
            try:
                sequence = int(row.get("shape_pt_sequence", "0") or 0)
                lat = float(row.get("shape_pt_lat", ""))
                lon = float(row.get("shape_pt_lon", ""))
            except (TypeError, ValueError):
                continue
            points[shape_id].append((sequence, lat, lon))

    encoded: dict[str, str] = {}
    for shape_id, rows in points.items():
        ordered = [(lat, lon) for _, lat, lon in sorted(rows, key=lambda x: x[0])]
        if len(ordered) >= 2:
            encoded[shape_id] = encode_polyline(ordered, 5)
    return encoded


def build_scheduled(blob: bytes, today: datetime):
    service_date = today.strftime("%Y-%m-%d")
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        require_members(zf, "All-operator")
        active = active_services(zf, today)

        agencies: dict[str, list[str]] = {}
        with csv_rows(zf, "agency.txt") as rows:
            for row in rows:
                agency_id = (row.get("agency_id", "") or "").strip()
                if not agency_id:
                    continue
                agencies[agency_id] = [
                    (row.get("agency_name", "") or agency_id).strip(),
                    (row.get("agency_url", "") or "").strip(),
                ]

        route_map: dict[str, tuple[str, str, str, str]] = {}
        with csv_rows(zf, "routes.txt") as rows:
            for row in rows:
                route_id = row.get("route_id", "")
                if route_id:
                    route_map[route_id] = (
                        row.get("route_short_name", "").strip(),
                        row.get("route_long_name", "").strip(),
                        route_mode(row.get("route_type", "3")),
                        row.get("agency_id", "").strip(),
                    )

        active_trips: dict[str, tuple[str, str, str, str, str, str, str]] = {}
        active_shape_ids: set[str] = set()
        with csv_rows(zf, "trips.txt") as rows:
            for row in rows:
                trip_id = row.get("trip_id", "")
                route_id = row.get("route_id", "")
                if not trip_id or row.get("service_id") not in active:
                    continue
                short, long, mode, agency_id = route_map.get(route_id, ("", "", "bus", ""))
                shape_id = row.get("shape_id", "").strip()
                if shape_id:
                    active_shape_ids.add(shape_id)
                active_trips[trip_id] = (
                    short,
                    long,
                    mode,
                    row.get("trip_headsign", "").strip(),
                    route_id,
                    shape_id,
                    agency_id,
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
                    row.get("zone_id", "").strip(),
                ]

        encoded_shapes = build_active_shapes(zf, active_shape_ids)

    valid_stop_ids = set(stop_lookup)
    compact_trips = []
    sequence_by_trip: dict[str, tuple[str, ...]] = {}
    used_agencies: set[str] = set()
    for trip_id, meta in active_trips.items():
        rows = sorted(stop_times_by_trip.get(trip_id, []), key=lambda x: x[0])
        compact_stops = [[stop_id, arr, dep] for _, stop_id, arr, dep in rows if stop_id in valid_stop_ids]
        if len(compact_stops) < 2:
            continue
        short, long, mode, headsign, route_id, shape_id, agency_id = meta
        compact_trips.append([
            trip_id, short, long, mode, headsign, compact_stops,
            route_id, shape_id, agency_id,
        ])
        sequence_by_trip[trip_id] = tuple(stop[0] for stop in compact_stops)
        if agency_id:
            used_agencies.add(agency_id)

    if not compact_trips or not stop_lookup:
        raise RuntimeError("The compact daily transit dataset would be empty; refusing to publish it")

    filtered_agencies = {key: value for key, value in agencies.items() if key in used_agencies}
    return stop_lookup, compact_trips, sequence_by_trip, encoded_shapes, filtered_agencies


def strict_realtime_eligible(
    all_sequences: dict[str, tuple[str, ...]],
    realtime_sequences: dict[str, tuple[str, ...]],
) -> list[str]:
    return sorted(
        trip_id
        for trip_id, sequence in all_sequences.items()
        if realtime_sequences.get(trip_id) == sequence
    )


def write_shape_shards(shapes: dict[str, str]) -> None:
    shape_dir = OUT / "shapes"
    if shape_dir.exists():
        shutil.rmtree(shape_dir)
    shape_dir.mkdir(parents=True, exist_ok=True)
    shards: dict[str, dict[str, str]] = defaultdict(dict)
    for shape_id, encoded in shapes.items():
        shards[shape_shard(shape_id)][shape_id] = encoded
    options = dict(ensure_ascii=False, separators=(",", ":"))
    for index in range(SHAPE_SHARDS):
        name = f"{index:02x}"
        (shape_dir / f"{name}.json").write_text(
            json.dumps(shards.get(name, {}), **options),
            encoding="utf-8",
        )


def main() -> int:
    now = datetime.now(DUBLIN)
    service_date = now.strftime("%Y-%m-%d")
    all_blob = download(GTFS_ALL_URL, "NTA all-operator GTFS")
    stop_lookup, compact_trips, all_sequences, shapes, agencies = build_scheduled(all_blob, now)

    realtime_status = "unavailable"
    realtime_error = None
    realtime_sequences: dict[str, tuple[str, ...]] = {}
    try:
        rt_blob = download(GTFS_REALTIME_STATIC_URL, "NTA realtime-compatible GTFS")
        realtime_sequences = realtime_trip_sequences(rt_blob, now)
        realtime_status = "matched"
    except Exception as exc:
        realtime_error = str(exc)
        print(f"Realtime-compatible GTFS unavailable: {exc}", file=sys.stderr)

    eligible = strict_realtime_eligible(all_sequences, realtime_sequences)

    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": "3",
        "available": True,
        "source": "National Transport Authority GTFS",
        "sourceUrl": GTFS_ALL_URL,
        "license": "CC BY 4.0",
        "serviceDate": service_date,
        "generatedAt": now.isoformat(timespec="seconds"),
        "stopCount": len(stop_lookup),
        "tripCount": len(compact_trips),
        "shapeCount": len(shapes),
        "shapeShardCount": SHAPE_SHARDS,
        "shapeEncoding": "polyline5; ordered GTFS shape points; no topology simplification",
        "coverage": "Ireland scheduled public transport",
        "planner": {
            "maxTransfers": 2,
            "nearbyInterchangeMeters": 250,
            "fareEvidence": "official reference rules only; unavailable where eligibility cannot be proven",
        },
        "realtimeCompatibility": {
            "status": realtime_status,
            "sourceUrl": GTFS_REALTIME_STATIC_URL,
            "eligibleTripCount": len(eligible),
            "eligibleRatio": round(len(eligible) / max(1, len(compact_trips)), 4),
            "strictJoin": "trip_id + exact ordered stop_id sequence",
            "error": realtime_error,
        },
        "realtime": {
            "nta": "Server-side GTFS-Realtime v2 snapshot when configured",
            "rail": "Irish Rail public realtime remains a fallback/cross-check",
        },
    }

    eligible_payload = {
        "version": "1",
        "generatedAt": now.isoformat(timespec="seconds"),
        "serviceDate": service_date,
        "sourceUrl": GTFS_REALTIME_STATIC_URL,
        "strictJoin": "trip_id + exact ordered stop_id sequence",
        "tripIds": eligible,
    }

    json_options = dict(ensure_ascii=False, separators=(",", ":"))
    (OUT / "manifest.json").write_text(json.dumps(manifest, **json_options), encoding="utf-8")
    (OUT / "stops.json").write_text(json.dumps(stop_lookup, **json_options), encoding="utf-8")
    (OUT / "trips.json").write_text(json.dumps(compact_trips, **json_options), encoding="utf-8")
    (OUT / "agencies.json").write_text(json.dumps(agencies, **json_options), encoding="utf-8")
    (OUT / "realtime_eligible.json").write_text(json.dumps(eligible_payload, **json_options), encoding="utf-8")
    write_shape_shards(shapes)

    print(
        f"Published {len(stop_lookup):,} stops, {len(compact_trips):,} active trips, "
        f"{len(shapes):,} GTFS shapes and {len(eligible):,} strict realtime-compatible trips "
        f"for {service_date}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Transit build failed: {exc}", file=sys.stderr)
        raise
