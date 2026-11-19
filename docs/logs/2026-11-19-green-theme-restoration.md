# XPLORE — Green theme restoration
Date: 2026-11-19
Change ID: XPL-UI-20261119-01
Status: IMPLEMENTED on `main`; physical device/browser verification pending.

## Business Learning Log
- Context: Owner prefers the established dark green visual identity for now.
- Learning: Professional navy/teal experiment is optional, not the default design direction.
- Evidence: Explicit owner request (2026-11-19); no external usability study.

## System and Architecture Logs
- Switched `index.html` away from `ui-business.css` and `brand-theme.css`.
- Original green base styling remains supplied by `styles.css`, `navigation.css`, `mobile.css`, and other pre-existing CSS.
- New `motion-green.css` only styles the existing illustrative motion widgets; it does not alter the map, navigation layout, GPS, APIs or scoring.
- Preserved the existing scripts, route form, map and context panels.

## Automation Log
- `ui-workflow.js` and `brand-motion.js` retained; no changes to location/routing automations or integrations.
- Workflow animation retains its pause and reduced-motion behaviors.

## Recommendation and Experiment Logs
- Keep the navy/teal experiment available under `uiux/enterprise-gradient-2026-11-16` for later comparison.
- Avoid restyling map navigation controls until a direct usability review is completed.
- Experimental results: not measured; previous palette not validated as superior.

## External Evidence Log
- Source: owner preference and live repository source inspection; no external evidence cited or claimed.

## Risk and Assumption Log
- Risk: CSS cascade or browser cache may temporarily show a previous stylesheet. Likelihood: low to medium; impact: low to medium.
- Mitigation: revised stylesheet link with version query, remove enterprise stylesheets from index, static file checks, browser/mobile QA.
- Owner: project maintainer. Status: pending visual verification.

## Data & Integration Log
- No data source, geolocation, map tiles, routing, persistence or integration modifications.

## Product / Feature Log
- Restored dark-green interface. Both conceptual data-to-reporting and decision-intelligence graphics remain present, now green.

## Merchant & Fulfilment Log
- Not applicable.

## Expansion Log
- A future theme toggle is an option only; not implemented.

## Decision Log
- Decision ID: XPL-DEC-20261119-01.
- Decision: Restore original green palette on `main`, keep experimental UI/UX branch unmodified.
- Reason: user preference and safe rollback without functional changes.

## Change / Release Log
- Modified: `index.html`, `tests/ui-design.test.cjs`
- Added: `motion-green.css`
- Enterprise theme files remain in Git history and on the preserved branch but are not referenced by main `index.html`.
- Live GitHub Pages deployment not independently verified.

## Validation / QA Log
- Source-level assertions pending final inspection.
- `node --test tests/*.test.cjs` and real browser/mobile screenshot tests not executed in this session.
- Status: code restoration complete; QA pending.
