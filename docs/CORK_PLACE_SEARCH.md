# Cork place search audit — v0.5.3

Date: 2026-10-11. Owner: XPLORE maintainer. All implementation statuses below refer to code and simulated verification; mobile device validation is pending.

| Log | ID | Status | Evidence / change / rationale | Next step |
| --- | --- | --- | --- | --- |
| Business Learning | BL-SEARCH-001 | OBSERVED | Live Photon full Desi Bites query returned zero results; short query returned other businesses; estate query resolved. A geocoder is not a complete business directory. | Track coverage gaps per source. |
| System | SYS-SEARCH-001 | IMPLEMENTED | Check available personal/address corrections first, then static Cork POIs, then online geocoding. | Device smoke test. |
| Architecture | ARCH-SEARCH-001 | IMPLEMENTED | Provider wrapper retains existing explicit selection and exact-Eircode path. Cork module loads after current app modules. | Expand independently of routing. |
| Automation | AUTO-SEARCH-001 | IMPLEMENTED | Manual reproducible Overpass extract builder; no per-keystroke Overpass queries or scheduled refresh. Empty extracts do not replace existing data. | Choose future freshness schedule based on use. |
| Recommendation | REC-SEARCH-001 | PROPOSED | Expand city/suburb index to validated County Cork boundaries, then Ireland; evaluate licensed business-data providers if open data coverage remains insufficient. | Requires provider/terms/cost evaluation; no paid API configured. |
| Experiment | EXP-SEARCH-001 | VALIDATED IN SIMULATION | Tests cover real English Market extract match and Desi Bites full query, partial spelling, other-city rejection, retry/cache, cancellation and offline personal pins. | Real-world acceptance set. |
| External Evidence | EXT-SEARCH-001 | VERIFIED SOURCE | Business address: https://desibites.ie/contact . Photon implementation/docs: https://github.com/komoot/photon . Estate OSM way 75862158 resolved by Photon to 51.8759212,-8.481984. Overpass raw extract contained 4,596 elements, transformed to 4,586 usable named POIs. | Verify Desi entrance on site before marking precise. |
| Risk & Assumption | RISK-SEARCH-001 | MITIGATED | Method: preserve coordinate precision labels in suggestion, confirmation and destination. High impact if estate location is treated as exact business entrance. Approximate estate pin is explicitly unverified. | On-site entrance confirmation pending. |
| Risk & Assumption | RISK-SEARCH-002 | OPEN | OSM completeness/freshness and public Photon availability vary. Snapshot does not ensure every place exists or remains open. | Broader coverage and refresh policy. |
| Data & Integration | DATA-SEARCH-001 | IMPLEMENTED | Cork city/suburb bounding box 51.82,-8.66,51.96,-8.32; source IDs, aliases, type, address, coordinate precision and extract timestamps. ODbL attribution retained. | Full county boundary not included. |
| Product / Feature | FEAT-SEARCH-001 | IMPLEMENTED | Cork POI lookup and long business query retry; name and locality matching; explicit selection remains mandatory. | Device search QA. |
| Product / Feature | FEAT-SEARCH-002 | IMPLEMENTED | Missing-place form accepts named user pin via map click/coordinates; user can remove saved place by name. | Device pin-picker QA. |
| Merchant & Fulfilment | MERCH-SEARCH-001 | NOT APPLICABLE | Public business location lookup only; no merchant contact or ordering integration. | None. |
| Expansion | EXPAND-SEARCH-001 | PROPOSED | City/suburb pilot first, county and national coverage later. | Validate precision and missing-place rate before expansion. |
| Decision | DEC-SEARCH-001 | IMPLEMENTED | Improve open/local coverage without introducing paid credentials. Keep business identity separately sourced from OSM estate coordinates. | No claim of Google-equivalent coverage. |
| Security & Privacy | PRIV-SEARCH-001 | IMPLEMENTED | Personal pins saved locally, max 100, no new server upload; field rendering uses existing HTML escaping. No autocomplete history is logged. | No cross-device sync; clear storage deletes pins. |
| Validation / QA | QA-SEARCH-001 | VALIDATED IN SIMULATION | 18 tests pass across Cork search and existing navigation; JS syntax and diff checks pass. | Physical browser/mobile QA pending. |
| Change / Release | REL-SEARCH-001 | IMPLEMENTED | New search module/styles/data, builder, tests and bootstrap cache keys v0.5.3. | Deploy via GitHub Pages. |
| KPI / Measurement | KPI-SEARCH-001 | PROPOSED | Benchmark named places: found/not-found, correct identity, coordinate/entrance accuracy, latency and false matches. | No population-wide coverage percentage measured. |
| Cost / Resource | COST-SEARCH-001 | IMPLEMENTED | Static 821,563-byte POI file downloaded once per page load; cached query results bounded to 80 entries for five minutes. No paid API or backend. | Consider compact extracts/caching with scale. |

## Acceptance checks

- Search `Desi Bites`, `Desi Bites Cork` and full restaurant/estate address. Expect the restaurant with the estate-level warning; never treat it as a verified entrance.
- Search `English Market, Cork`. Expect local mapped results.
- Search a Cork restaurant name with a different city qualifier. Do not replace it with a Cork correction.
- Stop guidance; save a named missing place by tapping its entrance; confirm it as destination. Reload and search the saved name. Remove it by name when no longer needed.
- Check exact Eircode and coordinate input still use the existing paths.
- Test online-service failure and stale autocomplete cancellation. Local data helps search; routing services and map tiles still require network availability.
