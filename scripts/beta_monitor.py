#!/usr/bin/env python3
"""Public production smoke monitor for XPLORE Beta.

Checks only public Pages assets and public transport data. No location, browser,
tester or user data is requested or processed.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path


def get(url: str, attempts: int = 3) -> bytes:
    last = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "XPLORE-beta-monitor/1.0"})
            with urllib.request.urlopen(req, timeout=25) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                return response.read()
        except Exception as exc:
            last = exc
            if attempt + 1 < attempts:
                time.sleep(4)
    raise RuntimeError(f"{url}: {last}")


def get_json(url: str):
    return json.loads(get(url).decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="https://utpal-mishra.github.io/Xplore/")
    parser.add_argument("--output", default="beta-monitor-report.json")
    args = parser.parse_args()
    base = args.base.rstrip("/") + "/"
    checks = {}
    errors = []
    warnings = []

    try:
        homepage = get(base).decode("utf-8", errors="replace")
        checks["homepage"] = "Ireland v1.0.0 Beta" in homepage
        if not checks["homepage"]:
            errors.append("deployed homepage does not expose Ireland v1.0.0 Beta")
    except Exception as exc:
        checks["homepage"] = False
        errors.append(str(exc))

    try:
        manifest = get_json(base + "data/transit/manifest.json")
        checks["transitManifest"] = bool(manifest.get("available"))
        service_date = date.fromisoformat(manifest["serviceDate"])
        age_days = abs((date.today() - service_date).days)
        checks["transitFresh"] = age_days <= 1
        checks["shapeCount"] = int(manifest.get("shapeCount") or 0)
        checks["shapeShardCount"] = int(manifest.get("shapeShardCount") or 0)
        if not checks["transitManifest"]:
            errors.append("transit manifest unavailable")
        if not checks["transitFresh"]:
            warnings.append(f"transit data is {age_days} day(s) from monitor date")
        if checks["shapeCount"] <= 0 or checks["shapeShardCount"] <= 0:
            errors.append("GTFS shape metadata missing")
    except Exception as exc:
        checks["transitManifest"] = False
        errors.append(f"transit manifest: {exc}")

    try:
        shard = get_json(base + "data/transit/shapes/00.json")
        checks["shapeShard"] = isinstance(shard, dict)
        if not checks["shapeShard"]:
            errors.append("shape shard 00 is invalid")
    except Exception as exc:
        checks["shapeShard"] = False
        errors.append(f"shape shard: {exc}")

    try:
        fare = get_json(base + "data/transit/fare_rules_v09.json")
        checks["fareBoundary"] = fare.get("status") == "official-reference-not-universal-quote"
        if not checks["fareBoundary"]:
            errors.append("fare evidence boundary invalid")
    except Exception as exc:
        checks["fareBoundary"] = False
        errors.append(f"fare rules: {exc}")

    realtime_status = "unknown"
    try:
        realtime = get_json(base + "data/realtime/manifest.json")
        realtime_status = str(realtime.get("status") or "unknown")
        checks["realtimeManifest"] = True
    except Exception as exc:
        checks["realtimeManifest"] = False
        warnings.append(f"realtime manifest unavailable: {exc}")

    report = {
        "schema": "xplore-beta-monitor-v1",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "base": base,
        "status": "fail" if errors else ("warning" if warnings else "pass"),
        "checks": checks,
        "realtimeStatus": realtime_status,
        "errors": errors,
        "warnings": warnings,
        "privacy": "Public app/system data only; no user/tester/location data accessed.",
    }
    Path(args.output).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
