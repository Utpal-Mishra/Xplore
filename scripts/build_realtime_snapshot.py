#!/usr/bin/env python3
"""Build a compact XPLORE v0.7 live-mobility snapshot from NTA GTFS-Realtime v2.

Security and fair-use constraints:
- API key is read only from NTA_GTFS_RT_API_KEY.
- The browser never sees the key.
- One combined-feed request is made per invocation; there are no immediate retries.
- Only trips proven compatible with today's realtime static GTFS are retained.
- Failed/stale fetches exit non-zero so the previous successful Pages deployment remains live.

The default combined endpoint can be overridden with XPLORE_NTA_GTFS_RT_URL if the
NTA developer portal assigns a different URL to the account.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(os.environ.get("XPLORE_ROOT", "."))
TRANSIT_DIR = ROOT / "data" / "transit"
OUT = ROOT / "data" / "realtime"
API_KEY = os.environ.get("NTA_GTFS_RT_API_KEY", "").strip()
FEED_URL = os.environ.get(
    "XPLORE_NTA_GTFS_RT_URL",
    "https://api.nationaltransport.ie/gtfsr/v2/gtfsr",
).strip()
DUBLIN = ZoneInfo("Europe/Dublin")
USER_AGENT = "XPLORE-live-mobility/0.7 (+https://github.com/Utpal-Mishra/Xplore)"
MAX_FEED_AGE_SEC = int(os.environ.get("XPLORE_MAX_GTFS_RT_AGE_SEC", "900"))


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def enum_name(message, field_name: str) -> str:
    try:
        field = message.DESCRIPTOR.fields_by_name[field_name]
        value = getattr(message, field_name)
        return field.enum_type.values_by_number[int(value)].name
    except Exception:
        return ""


def translated_text(value) -> str:
    try:
        translations = list(value.translation)
    except Exception:
        return ""
    preferred = next((x.text for x in translations if getattr(x, "language", "") in {"en", "en-IE"} and x.text), None)
    if preferred:
        return preferred.strip()
    return (translations[0].text if translations else "").strip()


def has_scalar(message, name: str) -> bool:
    try:
        return message.HasField(name)
    except Exception:
        value = getattr(message, name, 0)
        return bool(value)


def service_seconds_from_epoch(epoch: int, service_day: date) -> int | None:
    if not epoch:
        return None
    dt = datetime.fromtimestamp(int(epoch), tz=DUBLIN)
    delta = (dt.date() - service_day).days
    return delta * 86400 + dt.hour * 3600 + dt.minute * 60 + dt.second


def event_delay(event, scheduled: int | None, service_day: date) -> int | None:
    if event is None:
        return None
    event_time = int(getattr(event, "time", 0) or 0)
    if event_time and scheduled is not None:
        predicted = service_seconds_from_epoch(event_time, service_day)
        if predicted is not None:
            value = predicted - int(scheduled)
            if abs(value) <= 7 * 86400:
                return value
    if has_scalar(event, "delay"):
        value = int(getattr(event, "delay", 0))
        if abs(value) <= 7 * 86400:
            return value
    return None


def static_context():
    manifest = read_json(TRANSIT_DIR / "manifest.json")
    eligible_payload = read_json(TRANSIT_DIR / "realtime_eligible.json")
    if manifest.get("serviceDate") != eligible_payload.get("serviceDate"):
        raise RuntimeError("Scheduled and realtime-compatible static datasets have different service dates")

    eligible = {str(x) for x in eligible_payload.get("tripIds", [])}
    if not eligible:
        raise RuntimeError("No strict realtime-compatible trips are available for today's static schedule")

    trips = read_json(TRANSIT_DIR / "trips.json")
    schedule = {}
    route_ids = set()
    stop_ids = set()
    for row in trips:
        trip_id = str(row[0])
        if trip_id not in eligible:
            continue
        route_id = str(row[6] if len(row) > 6 else "")
        route_ids.add(route_id)
        stop_map = {}
        for stop in row[5] or []:
            stop_id = str(stop[0])
            stop_ids.add(stop_id)
            stop_map[stop_id] = (int(stop[1]), int(stop[2]))
        schedule[trip_id] = {"routeId": route_id, "stops": stop_map}

    service_day = datetime.strptime(manifest["serviceDate"], "%Y-%m-%d").date()
    return manifest, eligible, schedule, route_ids, stop_ids, service_day


def fetch_feed() -> bytes:
    if not API_KEY:
        raise RuntimeError("NTA_GTFS_RT_API_KEY is not configured")
    request = urllib.request.Request(
        FEED_URL,
        headers={
            "Accept": "application/x-protobuf,application/octet-stream,*/*",
            "Cache-Control": "no-cache",
            "User-Agent": USER_AGENT,
            "x-api-key": API_KEY,
        },
    )
    # Deliberately one request only: NTA fair-use requires spacing between calls.
    with urllib.request.urlopen(request, timeout=45) as response:
        blob = response.read()
        if not blob:
            raise RuntimeError("NTA GTFS-Realtime returned an empty response")
        return blob


def main() -> int:
    manifest, eligible, schedule, route_ids, stop_ids, service_day = static_context()

    try:
        from google.transit import gtfs_realtime_pb2
    except ImportError as exc:
        raise RuntimeError("gtfs-realtime-bindings is required to decode the NTA feed") from exc

    blob = fetch_feed()
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(blob)

    now_epoch = int(time.time())
    feed_timestamp = int(getattr(feed.header, "timestamp", 0) or 0)
    feed_age = max(0, now_epoch - feed_timestamp) if feed_timestamp else None
    if feed_age is not None and feed_age > MAX_FEED_AGE_SEC:
        raise RuntimeError(f"NTA feed is stale ({feed_age}s old); refusing to replace the last good snapshot")

    trip_updates = {}
    vehicles = {}
    alerts = []

    for entity in feed.entity:
        if entity.HasField("trip_update"):
            update = entity.trip_update
            trip_id = str(update.trip.trip_id or "")
            if trip_id not in eligible:
                continue
            static_trip = schedule.get(trip_id, {})
            stops = {}
            for stu in update.stop_time_update:
                stop_id = str(stu.stop_id or "")
                if not stop_id or stop_id not in static_trip.get("stops", {}):
                    continue
                scheduled_arrival, scheduled_departure = static_trip["stops"][stop_id]
                arr = event_delay(stu.arrival if stu.HasField("arrival") else None, scheduled_arrival, service_day)
                dep = event_delay(stu.departure if stu.HasField("departure") else None, scheduled_departure, service_day)
                relationship = enum_name(stu, "schedule_relationship")
                if arr is None and dep is None and not relationship:
                    continue
                stops[stop_id] = [arr, dep, relationship]
            trip_updates[trip_id] = {
                "r": str(update.trip.route_id or static_trip.get("routeId", "")),
                "rel": enum_name(update.trip, "schedule_relationship"),
                "ts": int(getattr(update, "timestamp", 0) or 0),
                "s": stops,
            }

        if entity.HasField("vehicle"):
            vehicle = entity.vehicle
            trip_id = str(vehicle.trip.trip_id or "")
            if trip_id not in eligible or not vehicle.HasField("position"):
                continue
            pos = vehicle.position
            lat = float(getattr(pos, "latitude", 0.0))
            lon = float(getattr(pos, "longitude", 0.0))
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                continue
            bearing = float(pos.bearing) if has_scalar(pos, "bearing") else None
            speed = float(pos.speed) if has_scalar(pos, "speed") else None
            vehicles[trip_id] = [
                round(lat, 6),
                round(lon, 6),
                int(getattr(vehicle, "timestamp", 0) or 0),
                round(bearing, 1) if bearing is not None else None,
                round(speed, 2) if speed is not None else None,
                str(vehicle.trip.route_id or schedule.get(trip_id, {}).get("routeId", "")),
            ]

        if entity.HasField("alert"):
            alert = entity.alert
            trip_scope = set()
            route_scope = set()
            stop_scope = set()
            for informed in alert.informed_entity:
                trip_id = str(informed.trip.trip_id or "") if informed.HasField("trip") else ""
                route_id = str(informed.route_id or "")
                stop_id = str(informed.stop_id or "")
                if trip_id:
                    trip_scope.add(trip_id)
                if route_id:
                    route_scope.add(route_id)
                if stop_id:
                    stop_scope.add(stop_id)

            scoped_match = bool(
                trip_scope.intersection(eligible)
                or route_scope.intersection(route_ids)
                or stop_scope.intersection(stop_ids)
            )
            network_wide = not trip_scope and not route_scope and not stop_scope
            if not scoped_match and not network_wide:
                continue

            periods = []
            for period in alert.active_period:
                periods.append([
                    int(getattr(period, "start", 0) or 0) or None,
                    int(getattr(period, "end", 0) or 0) or None,
                ])
            alerts.append({
                "id": str(entity.id or ""),
                "header": translated_text(alert.header_text)[:180],
                "description": translated_text(alert.description_text)[:500],
                "cause": enum_name(alert, "cause"),
                "effect": enum_name(alert, "effect"),
                "periods": periods[:6],
                "tripIds": sorted(x for x in trip_scope if x in eligible)[:50],
                "routeIds": sorted(x for x in route_scope if x in route_ids)[:50],
                "stopIds": sorted(x for x in stop_scope if x in stop_ids)[:80],
                "networkWide": network_wide,
            })

    generated = datetime.now(DUBLIN).isoformat(timespec="seconds")
    payload = {
        "version": "1",
        "generatedAt": generated,
        "feedTimestamp": datetime.fromtimestamp(feed_timestamp, tz=DUBLIN).isoformat(timespec="seconds") if feed_timestamp else None,
        "tripUpdates": trip_updates,
        "vehicles": vehicles,
        "alerts": alerts,
    }
    out_manifest = {
        "version": "1",
        "status": "live",
        "source": "National Transport Authority GTFS-Realtime v2",
        "sourceUrl": FEED_URL,
        "generatedAt": generated,
        "feedTimestamp": payload["feedTimestamp"],
        "feedAgeSec": feed_age,
        "serviceDate": manifest.get("serviceDate"),
        "strictJoin": "current GTFS_Realtime.zip trip_id + exact ordered stop_id sequence",
        "eligibleTripCount": len(eligible),
        "matchedTripUpdates": len(trip_updates),
        "matchedVehicles": len(vehicles),
        "alertCount": len(alerts),
        "pollCadence": "5-minute server-side snapshot",
        "credentials": "NTA API key retained in GitHub Actions secret; never published",
    }

    write_json(OUT / "feed.json", payload)
    write_json(OUT / "manifest.json", out_manifest)
    print(
        f"Live snapshot: {len(trip_updates):,} trip updates, "
        f"{len(vehicles):,} vehicles, {len(alerts):,} alerts; feed age={feed_age}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Realtime snapshot failed: {exc}", file=sys.stderr)
        raise
