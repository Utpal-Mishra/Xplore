# XPLORE Validation / QA Log

## 2026-11-19 — QA-LOC-001 — Location search regression check
Validated:
- JavaScript parses successfully.
- Forced `, Cork, Ireland` suffix is absent.
- Candidate distance sorting is present.
- Live-location state is present.
- Destination search is anchored to the resolved journey start.

**Regression scenario:** User in/starting from Kildare Town searches “Circle K”; a Cork branch must not win solely due to a hard-coded city bias.

**Status:** Passed static validation. Live browser/provider ranking should continue to be tested with real searches.
