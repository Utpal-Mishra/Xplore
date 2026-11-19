# XPLORE Enterprise Readiness

This checklist is a release gate, not a marketing claim.

## v1.0 Beta controls already implemented

The following controls exist in the current controlled web Beta. They reduce release risk but **do not make XPLORE enterprise-ready**:

- automated JavaScript/Python regression suite on pull requests and main
- offline v1.0 release gate covering critical repository invariants
- public GitHub Pages smoke monitoring hourly and after deployments
- managed NTA realtime credential boundary: no API key in browser code
- strict Scheduled fallback when authenticated NTA realtime is unavailable
- local analytics data minimisation, 30-day capped retention, export and clear controls
- explicit local analytics opt-out
- pseudonymous local Founding Tester mode without name/email collection
- privacy-warning public Beta issue form
- evidence-gated Route Intelligence with accessibility excluded from numeric scoring
- exact-match realtime joins and bounded transit/fare evidence claims

The checklist below remains the target for a later production/enterprise architecture. Unchecked items must not be implied as complete merely because v1.0 Beta exists.

## Product and data
- [ ] Real routing provider integrated behind an adapter.
- [ ] Data provenance recorded for every contextual signal.
- [ ] Freshness/expiry rules defined by signal type.
- [ ] Confidence model documented and calibrated.
- [ ] Route explanations derived from structured facts.
- [ ] Safety-critical/community claims have verification thresholds.
- [ ] Emissions factors are versioned and sourced.

## Engineering
- [ ] Frontend and backend boundaries defined.
- [ ] Versioned API contracts.
- [ ] Development/staging/production environments.
- [ ] CI for tests, linting and security checks.
- [ ] Controlled production deployment and rollback.
- [ ] Database migrations are automated/reversible.
- [ ] Feature flags for high-risk route/context changes.

## Testing
- [ ] Unit tests.
- [ ] API/integration tests.
- [ ] Routing regression suite.
- [ ] Geospatial/data-quality tests.
- [ ] Accessibility scenario tests.
- [ ] Mobile/browser tests.
- [ ] Load/performance tests.
- [ ] Failure/degraded-provider tests.

## Security and privacy
- [ ] Threat model completed.
- [ ] OAuth/OIDC where accounts are required.
- [ ] RBAC for administrative/moderation surfaces.
- [ ] TLS and encryption at rest.
- [ ] Managed secrets; no credentials in client/repository.
- [ ] Rate limiting/abuse controls.
- [ ] Dependency and secret scanning.
- [ ] Audit logging for privileged actions.
- [ ] Explicit location consent.
- [ ] Data minimisation and retention policy.
- [ ] User export/deletion flows.
- [ ] DPIA before high-scale precise-location processing.

## Reliability
Target initial SLO candidates (to validate with real load):
- Routing API availability: 99.9%
- Route calculation P95: <1.5 s excluding clearly disclosed degraded third-party dependencies
- Critical context ingestion: <30 s where source supports real time
- RPO: <15 min for durable application data
- RTO: <60 min

Required controls:
- [ ] Metrics.
- [ ] Structured logs.
- [ ] Distributed tracing when backend boundaries justify it.
- [ ] Alerting.
- [ ] Backups and tested restore.
- [ ] Incident runbooks.
- [ ] Provider degradation/fallback strategy.

## Community moderation
- [ ] Report lifecycle and expiry.
- [ ] Duplicate/corroboration logic.
- [ ] Abuse/spam protection.
- [ ] Escalation for safety-sensitive reports.
- [ ] Moderator audit trail.
- [ ] Ability to revoke incorrect observations quickly.

## Governance
- [ ] API/data-source licences reviewed.
- [ ] OpenStreetMap attribution/compliance reviewed for chosen providers.
- [ ] Accessibility claims have documented evidence standards.
- [ ] Model/scoring changes are versioned.
- [ ] Material scoring changes pass Cork regression journeys before release.
