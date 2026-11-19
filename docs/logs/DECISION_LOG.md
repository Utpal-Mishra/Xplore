# XPLORE Decision Log

## 2026-11-19 — D-LOC-001 — Location-relative place search
**Context:** Generic place searches such as “Circle K” were being forced toward Cork because geocoding appended “Cork, Ireland” to every query.

**Decision:** Remove the Cork suffix. Resolve up to 20 Irish candidates, bias Nominatim toward the journey start/live location, calculate great-circle distance, and select the nearest candidate. Destination search is anchored to the resolved journey start; when Start = Current location, that is the live user location.

**Rationale:** Generic brands and place names should resolve locally and predictably rather than to a fixed pilot city.

**Status:** Implemented.
