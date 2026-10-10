# Navigation recovery audit — v0.5.1

Date: 2026-10-11. Scope: browser journey continuity. Owner: XPLORE maintainer.

| Log | ID | Status | Change, rationale and evidence | Validation / next step |
| --- | --- | --- | --- | --- |
| Business Learning | BL-NAV-001 | OBSERVED | A route held only in JavaScript memory cannot survive tab discard/reload. | Persist active journeys independently of map instances. |
| System | SYS-NAV-001 | IMPLEMENTED | Visibility, pagehide/pageshow and freeze/resume lifecycle hooks preserve the route and reacquire GPS. | Automated lifecycle tests. |
| Architecture | ARCH-NAV-001 | IMPLEMENTED | Separate navigation-session module loads after all existing navigation/transit/mobile wrappers. It reuses existing maps and routing geometry. | Verify module load in browser. |
| Automation | AUTO-NAV-001 | IMPLEMENTED | Save on accepted GPS fixes, route selection and backgrounding; restore on startup; acquire uncached location on foregrounding. | Reload and delayed callback tests. |
| Recommendation | REC-NAV-001 | PROPOSED | Android foreground location service started by the explicit Start Guidance action, with an ongoing notification and Stop action, is the next step for screen-off tracking. | Native implementation and device testing required; not shipped. |
| Experiment | EXP-NAV-001 | VALIDATED IN SIMULATION | Lock/unlock and reload tests assert retention without a route-service call. | Physical phone lock/unlock not tested. |
| External Evidence | EXT-NAV-001 | VERIFIED DOCUMENTATION | W3C Geolocation restricts updates to active visible documents: https://www.w3.org/TR/geolocation/ . Android location service types: https://developer.android.com/develop/background-work/services/fgs/service-types#location . | Follow native permission requirements when implemented. |
| Risk & Assumption | RISK-NAV-001 | MITIGATED IN WEB | Method: save lifecycle state and age GPS fixes. Impact: stale positions may look live. Mitigation: fresh-GPS status, hide stale speed, reject old/out-of-order fixes. Browser lock GPS suspension is expected. | Real-device verification pending. |
| Risk & Assumption | RISK-NAV-002 | OPEN | Browser storage, tab restoration and network/CDN availability are not guaranteed. Impact: session or app may be unavailable after a cold start. | No full offline or terminated-tab recovery guarantee. |
| Data & Integration | DATA-NAV-001 | IMPLEMENTED | Versioned sessionStorage snapshot includes routes, mode, selected addresses, camera, voice and last fix. No new tracking server or sharing integration. | 12-hour expiry and malformed-session tests. |
| Product / Feature | FEAT-NAV-001 | IMPLEMENTED | Route recovery, stale-GPS message and optional Keep screen on toggle. | Wake lock support is device/browser dependent. |
| Merchant & Fulfilment | MERCH-NAV-001 | NOT APPLICABLE | No merchant or fulfilment change. | None. |
| Expansion | EXPAND-NAV-001 | PROPOSED | Native Android navigation layer for background GPS and ongoing lock-screen notification; iOS requires a separate implementation. | Not implemented by browser recovery. |
| Decision | DEC-NAV-001 | IMPLEMENTED | Preserve journey intent across backgrounding; refresh GPS without immediately replanning merely because the screen unlocked. Ordinary movement/off-route rerouting remains active after a fresh fix. | Route-service call count tests. |
| Security & Privacy | PRIV-NAV-001 | IMPLEMENTED | Recovery stays within the existing tab's session storage; stop/reset clears the record. No new remote location logging. Existing routing/map providers remain in use. | Stop/reset/storage-error tests. |
| Validation / QA | QA-NAV-001 | VALIDATED IN SIMULATION | Eight Node tests cover lifecycle, restore, old callbacks, denied/timed-out GPS, invalid/expired snapshots, manual changes and storage failure. | Browser smoke test blocked: Chromium download failed in the execution environment. Physical device QA pending. |
| Change / Release | REL-NAV-001 | IMPLEMENTED | Add session module, status and wake control; update module/CSS cache keys to v0.5.1. | GitHub Pages deployment must finish before mobile refresh. |
| Cost / Resource | COST-NAV-001 | IMPLEMENTED | No additional backend or paid dependency. Wake lock is opt-in; GPS and screen use consume battery. | User controls Stop and Keep screen on. |

## Device acceptance checks (pending)

1. Start a walking route; choose an alternative; lock for 1–5 minutes; unlock. The route and destination should remain, stale GPS should be labelled, then a fresh fix should update progress.
2. Reload during guidance; verify the selected route, mode, destination and voice setting recover. No route request should occur merely to restore the saved route.
3. Deny GPS; verify guidance stops and recovery is cleared. Timeout should preserve the route with a waiting status.
4. Stop guidance or edit destination; reload and verify the old journey does not return.
5. Enable Keep screen on during guidance; verify wake lock while visible, release on stop, and reacquisition after unlock when supported.
6. Manually lock the phone: browser screen-off GPS and lock-screen live notifications are unsupported in this release. Do not treat a saved fix as live tracking.

## v0.5.2 — navigation dock layout (2026-10-11)

- FEAT-NAV-002 / IMPLEMENTED: match tracking status and screen toggle typography to guidance controls, with readable wrapping and compact button sizing.
- SYS-NAV-002 / ARCH-NAV-002 / IMPLEMENTED: measure the dock's top edge relative to the map and position Recenter/attribution 12 px above it. Observe dock/map resizing so multiline status, viewport changes and safe-area spacing retain clearance.
- RISK-NAV-003 / MITIGATED: fixed bottom offsets overlapped the taller navigation dock. Use measured clearance with a CSS fallback. Owner: XPLORE maintainer.
- QA-NAV-002: existing navigation regression tests and syntax checks; dock clearance checked at multiple simulated heights. Physical mobile layout verification pending.
- REL-NAV-002: bump session loader, stylesheet and visible version to v0.5.2. No new dependency or external data integration.
