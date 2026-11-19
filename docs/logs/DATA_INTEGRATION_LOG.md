# XPLORE Data & Integration Log

## 2026-11-19 — DI-LOC-001 — Nominatim search refinement
**Provider:** OpenStreetMap Nominatim.

**Change:** Search now requests up to 20 Ireland-only candidates, optionally supplies a location viewbox as a ranking bias, then performs client-side Haversine distance sorting.

**Important behavior:** The viewbox is not a hard geographic boundary; explicit/far-away Irish locations can still be returned. Generic destinations are ranked by proximity to the journey start.

**Status:** Implemented for development use.
