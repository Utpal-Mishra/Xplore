# XPLORE Risk & Assumption Log

## 2026-11-19 — RA-LOC-001 — Public geocoding result completeness
**Risk:** Nominatim may not return every branch of a chain within the first candidate set, so distance sorting can only rank returned candidates.

**Likelihood:** Medium.
**Impact:** Medium.
**Mitigation:** Request multiple candidates, apply local viewbox bias, rank client-side by distance, and plan a governed/self-hosted geocoder or richer POI provider for production.

**Status:** Open monitoring item.
