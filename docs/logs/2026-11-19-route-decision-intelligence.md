# XPLORE — Route-specific Decision Intelligence
**Date:** 2026-11-19  
**Change:** XPL-UI-20261119-02  
**Status:** Implemented on `main`; source-level interactive scenarios verified; full automated and on-device tests pending.  
**Scope:** Replace the illustrative Decision Intelligence animation only. Keep the Data to Decisions workflow animation and the existing green theme.

## Business Learning Log
- **ID:** XPL-BIZ-20261119-02
- **Problem:** The decision diagram looked polished but did not explain an actual journey.
- **Learning:** Route-specific, inspectable comparisons better serve navigation decisions than decorative data-flow illustrations.
- **Evidence:** Explicit owner request and source-level analysis; no external study asserted.

## System Log
- **ID:** XPL-SYS-20261119-02
- **Change:** Add `decision-insight.js` and `decision-insight.css`; call explanation renderer from `selectRoute`.
- **Status:** Implemented.

## Architecture Log
- **ID:** XPL-ARC-20261119-02
- **Decision:** Reuse existing `state.enrichedRoutes`, `scoreComponents`, `scoreWeights`, `state.lastContext` rather than duplicate scoring or add a service.
- **Rationale:** Remain deterministic and preserve a single scoring source of truth.
- **Guardrail:** New visual logic must not alter map routing, position tracking or provider data.

## Automation Log
- **ID:** XPL-AUTO-20261119-02
- **Change:** Recalculate panel when a candidate is selected (including map selection and navigation-session restoration); clear panel on journey reset and changed mode/preference.
- **No new scheduling or telemetry.**

## Recommendation Log
- **ID:** XPL-REC-20261119-02
- **Recommendation adopted:** Replace decorative Decision Intelligence animation with a meaningful route-specific explanation.
- **Behavior:** Explain preference priority and scoring contribution, compare time and estimated carbon with other candidates, and communicate weather/air-quality evidence limitations.

## Experiment Log
- **ID:** XPL-EXPERIMENT-20261119-02
- **Hypothesis:** The explanatory panel improves understanding of route trade-offs without occupying map space.
- **Status:** Implemented, not user-tested.
- **Future evaluation:** Comprehension, latency, mobile fit, and route-change accuracy.

## External Evidence Log
- **ID:** XPL-EVD-20261119-02
- **Sources:** Owner request and repository code examined; no external references used.

## Risk & Assumption Log
- **ID:** XPL-RISK-20261119-02
- **Method:** Qualitative likelihood × impact.
- **Risk 1:** Scoring limitations may be mistaken for verified safety or environmental claims. Likelihood medium, impact high.
  **Mitigation:** Label pilot estimates and confidence explicitly; disclose missing weather/air context and non-scored air quality.
- **Risk 2:** Stale comparisons after journey/preference changes. Likelihood medium, impact medium.
  **Mitigation:** Reset on route invalidation and mode/preference changes; rerender on selection/reroute and session restoration.
- **Risk 3:** Mobile left-pane congestion. Likelihood medium, impact medium.
  **Mitigation:** Compact responsive card below route form; keep map unmodified; physical QA still required.
- **Owner:** Project maintainer. **Status:** QA and real-device checks outstanding.

## Data & Integration Log
- **ID:** XPL-DATA-20261119-02
- **Sources consumed:** Existing route geometry-derived duration and distance, scoring components, preference weights, estimated carbon, context availability.
- **No new APIs, permissions, persistence, network requests or data-sharing.**

## Product / Feature Log
- **ID:** XPL-FEAT-20261119-02
- **Features:** Selected-route headline and score; comparison with fastest and lowest-emission candidate; dominant preference weight and component contribution; context and estimate caveats; empty state before routing.
- **Status:** Implemented.

## Merchant & Fulfilment Log
- **ID:** XPL-MERCH-20261119-02
- **Applicability:** Not applicable to route-scoring presentation.

## Expansion Log
- **ID:** XPL-EXPAND-20261119-02
- **Opportunity:** An optional full explanation drawer or user-tested comparison visualization.
- **Status:** Proposed only.

## Decision Log
- **ID:** XPL-DEC-20261119-02
- **Decision:** Replace the old Decision Intelligence animation in `main` while keeping the workflow animation and green look. Preserve previous experimental UI in its separate branch.
- **Status:** Implemented.

## Change / Release Log
- **ID:** XPL-REL-20261119-02
- **Added:** `decision-insight.js`, `decision-insight.css`, `tests/decision-insight.test.cjs`.
- **Modified:** `index.html`, `app.js`, `ireland-network.js`, `motion-green.css`.
- **Retained:** Unused `brand-motion.js` in Git history; removed its script reference and old animation markup.
- **Deployment:** Committed on `main`; live site deployment not independently verified.

## Validation / QA Log
- **ID:** XPL-QA-20261119-02
- **Passed:** Source compilation, CSS/script inclusion, selection/reset wiring, recommended and alternative candidate scenarios, preference-weight switch, missing weather and air-quality context, one-route case, no extra network/location calls.
- **Not run:** Repository's complete Node test suite, direct mobile browser interactions, visual contrast verification, real-route field tests.
- **Status:** Partial verification; no claim of production validation.

## Security & Privacy Log
- **ID:** XPL-SEC-20261119-02
- **Control:** Dynamic text written through `textContent`; new component requests no permissions and stores no user location.
- **Note:** Repository is public. Keep logs limited to implementation-level facts, without private strategy or credentials.

---

## UI clarification and correction — 2026-11-19

**ID:** XPL-DEC-20261119-03  
**Context / User Feedback:** Owner pointed out that the prior implementation replaced the *Decision Intelligence animation* but left the *Data to Decisions* card in front of the route form. The intended UX was to remove the generic data-to-reporting card, and keep the functional selected-route Decision Intelligence explanation.

**Decision / Rationale:** Remove `workflowMotion` and its `ui-workflow.js` / `motion-green.css` references from `index.html`; keep the route form prominent, with `decisionInsight` directly after it. Preserve the dark-green base theme and route-specific insight component. This corrects the UI hierarchy without changing route calculation, scoring, GPS, navigation or the map.

**System / Architecture / Automation / Integration:** No changes to route engine, APIs or mobile navigation. Unused animation assets remain in repository history and on the experimental UI branch, but are no longer loaded by `main`.

**Product / Feature:** First-screen focus is now the journey form. Decision Intelligence is visible below it and provides a placeholder until a route is selected, then the selected-route evidence and comparisons.

**Validation:** Verified the absent card/script/stylesheet references, preserved green base CSS, preserved route explanation scripts and placement. Updated `tests/ui-design.test.cjs` for the intended layout. Full browser, mobile and Node test-suite execution still pending.

**Risk / Mitigation:** Browser or CDN caching could temporarily show the previous layout. Confirm deployment and hard-refresh if needed. Owner: project maintainer. Status: static checks pending final verification.

**Merchant & Fulfilment:** Not applicable. **Expansion:** None approved. **External Evidence:** Direct user feedback. **Experiment:** Decorative animation withdrawn from main interface pending future use-case justification. **Business Learning:** Prioritise actionable route information over internal-system illustrations. **Recommendation:** Keep the improved Decision Intelligence explanation; don't reintroduce generic workflow diagrams in primary journey UI.
