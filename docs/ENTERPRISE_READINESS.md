# XPLORE Enterprise Readiness

This checklist is a release gate, not a marketing claim.

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
