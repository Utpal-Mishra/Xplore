# XPLORE Location-Relative POI Search Fix — 2026-11-19

## Decision Log — XP-DEC-LOC-001
**Problem:** Generic business searches could be hijacked by the Cork-specific OSM index even when the journey start was far outside Cork. A Kildare start searching for "Circle K" returned Cork branches roughly 165 km away.

**Decision:** Generic destination search is now anchored to the live/confirmed/typed Start location. Cork-local POI data receives priority only when the search anchor is within 60 km of Cork or the query explicitly targets Cork.

**Rationale:** A navigation product must interpret generic chain/business searches relative to the user's journey context, not a fixed pilot city.

**Status:** Implemented and regression-tested.

## System Log — XP-SYS-LOC-001
- Typed Start coordinates are accepted as an autocomplete bias before manual confirmation.
- Photon/OpenStreetMap autocomplete candidates are sorted nearest-first.
- Legacy geocoding no longer appends ", Cork, Ireland".
- Legacy destination geocoding is sequentially biased to the resolved Start.
- Default fallback map view is Ireland-wide.
- Address-search and Cork-place modules are cache-busted for mobile browsers.

## Architecture Log — XP-ARCH-LOC-001
Search precedence:
1. Live location, if active.
2. Confirmed Start selection.
3. Typed Start coordinates, when valid and inside Ireland bounds.
4. Ireland-wide neutral fallback.

Cork-specific POI enrichment is now a regional enhancement rather than a global first-pass source.

## Data & Integration Log — XP-DATA-LOC-001
**Nationwide adapter:** Photon / OpenStreetMap.
**Regional enrichment:** Cork OSM extract + curated corrections.
**Ranking:** Provider relevance constrained to Ireland, then client-side Haversine distance ordering relative to the search anchor.
**Cache:** Search cache remains location-keyed at coarse two-decimal bias precision.

## Product / Feature Log — XP-PROD-LOC-001
Expected user behavior:
- Start near Kildare + "Circle K" -> nationwide search and nearest returned Kildare-area branches first.
- Start near Cork + "Circle K" -> Cork local index may answer immediately.
- Query "Circle K Cork" from elsewhere -> Cork local enrichment remains eligible because Cork is explicit.

## Risk & Assumption Log — XP-RISK-LOC-001
**Risk:** Public geocoder completeness varies; nearest-first ranking can only rank candidates the provider returns.
**Likelihood:** Medium.
**Impact:** Medium.
**Mitigation:** Keep regional enrichment scoped, preserve explicit-locality behavior, retain personal saved pins, and move production POI search behind a governed multi-source provider layer.

## Validation / QA Log — XP-QA-LOC-001
Regression scenario added using Start `53.16297, -6.92073` and Destination query `Circle K`.
Validated:
- distant Cork index does not short-circuit nationwide search;
- typed Start coordinates become the destination bias;
- returned nationwide candidates are sorted nearest-first;
- explicit Cork queries still use richer Cork data;
- browser JavaScript syntax checks include app.js, address-search.js and cork-place-search.js;
- full JavaScript regression suite passed;
- transit compatibility suite passed;
- v1.0 Beta offline release gate passed.

## Change / Release Log — XP-REL-LOC-001
PR: #16 — Fix location-relative POI search outside Cork.
Branch: `agent/location-relative-poi-search`.
