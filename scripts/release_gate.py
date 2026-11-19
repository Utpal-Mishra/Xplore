#!/usr/bin/env python3
"""XPLORE v1.0 offline release gate.

Validates repository invariants that must hold before a Beta merge/deploy.
No network calls and no user data.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=".")
    args = parser.parse_args()
    root = Path(args.repo)
    errors: list[str] = []
    warnings: list[str] = []

    required = [
        "index.html",
        "eircode-provider.js",
        "beta-core-v10.js",
        "beta-v10.js",
        "beta-v10.css",
        "learning-core.js",
        "learning-v06.js",
        "data/transit/manifest.json",
        "data/transit/fare_rules_v09.json",
        "docs/V10_BETA.md",
    ]
    for rel in required:
        if not (root / rel).is_file():
            fail(errors, f"missing required file: {rel}")

    if errors:
        print("\n".join(f"ERROR: {x}" for x in errors))
        return 1

    index = (root / "index.html").read_text(encoding="utf-8")
    loader = (root / "eircode-provider.js").read_text(encoding="utf-8")
    learning = (root / "learning-v06.js").read_text(encoding="utf-8")

    if "Ireland v1.0.0 Beta" not in index:
        fail(errors, "index release badge is not Ireland v1.0.0 Beta")
    for asset in ("beta-core-v10.js?v=1.0.0", "beta-v10.js?v=1.0.0"):
        if asset not in loader:
            fail(errors, f"loader does not include {asset}")
    if "LOCAL_ANALYTICS_KEY" not in learning or "setLocalAnalyticsEnabled" not in learning:
        fail(errors, "local analytics opt-out API is missing")
    if "Raw GPS" not in (root / "beta-v10.js").read_text(encoding="utf-8"):
        fail(errors, "beta privacy inventory is missing")

    manifest = json.loads((root / "data/transit/manifest.json").read_text(encoding="utf-8"))
    if not manifest.get("available"):
        fail(errors, "transit manifest is not available")
    if int(manifest.get("shapeCount") or 0) <= 0:
        fail(errors, "transit manifest has no GTFS shapes")
    shard_count = int(manifest.get("shapeShardCount") or 0)
    if shard_count <= 0:
        fail(errors, "shape shard count is missing")
    shape_dir = root / "data/transit/shapes"
    actual_shards = list(shape_dir.glob("*.json")) if shape_dir.is_dir() else []
    if len(actual_shards) != shard_count:
        fail(errors, f"shape shard mismatch: manifest={shard_count}, files={len(actual_shards)}")

    service_date = str(manifest.get("serviceDate") or "")
    try:
        age = abs((date.today() - date.fromisoformat(service_date)).days)
        if age > 2:
            warnings.append(f"repository transit service date is {age} days from current runner date")
    except ValueError:
        fail(errors, "invalid transit serviceDate")

    fare = json.loads((root / "data/transit/fare_rules_v09.json").read_text(encoding="utf-8"))
    if fare.get("status") != "official-reference-not-universal-quote":
        fail(errors, "fare evidence boundary is missing or changed")

    # Scan public runtime assets/data for common accidental credential forms.
    public_paths = [
        root / "index.html",
        root / "app.js",
        root / "realtime-v07.js",
        root / "multimodal-v09.js",
        root / "beta-v10.js",
    ]
    secret_patterns = [
        re.compile(r"(?i)(api[_-]?key|secret|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{24,}['\"]"),
        re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{30,}"),
    ]
    for path in public_paths:
        text = path.read_text(encoding="utf-8")
        for pattern in secret_patterns:
            if pattern.search(text):
                fail(errors, f"possible hard-coded credential in public asset: {path.name}")

    if "NTA_GTFS_RT_API_KEY" in index or "NTA_GTFS_RT_API_KEY" in (root / "realtime-v07.js").read_text(encoding="utf-8"):
        fail(errors, "NTA secret name leaked into browser-facing runtime")

    print(json.dumps({
        "release": "1.0.0-beta",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "errors": errors,
        "warnings": warnings,
        "shapeCount": manifest.get("shapeCount"),
        "shapeShards": shard_count,
        "transitServiceDate": service_date,
    }, indent=2))

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
