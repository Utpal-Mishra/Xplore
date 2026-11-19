# XPLORE v1.0 Beta

XPLORE v1.0 is the first Beta release of the current Ireland web product.

"Beta" means the core journey-planning, explanation, learning, transit and operational guardrails are integrated and continuously checked. It does **not** mean the product is safety-certified, enterprise production-ready, or free from third-party/public-adapter limitations.

## Beta release contract

v1.0 combines the preceding release layers:

- v0.6 Learn — privacy-first local learning and feedback
- v0.7 Live Mobility — strict realtime compatibility/fallback architecture
- v0.8 Decision Intelligence — evidence-gated Route Intelligence
- v0.9 Multimodal — GTFS source shapes, bounded two-transfer planning and fare evidence
- v1.0 Beta — release gates, privacy controls, production smoke monitoring and Founding Tester workflow

## Reliability gates

### Pull request / main quality gate

The existing CI regression suite remains mandatory and now also validates:

- v1.0 Beta browser modules
- release-gate script syntax
- monitoring script syntax
- Beta privacy/tester invariants

### Offline release gate

`scripts/release_gate.py` blocks the Beta release when critical repository invariants fail.

Checks include:

- v1.0 release badge/module loading
- required Beta assets/docs
- local analytics opt-out API
- public privacy inventory
- transit manifest availability
- GTFS shape count and complete shard set
- fare-reference boundary
- common hard-coded credential patterns in public runtime assets
- NTA realtime secret name absent from browser runtime

Transit service-date drift is reported as a warning in the offline gate so a PR is not blocked merely because the repository is being inspected on a different day.

## Privacy controls

v1.0 adds an explicit Local Product Analytics switch.

When switched off:

- journey planning continues normally
- new coarse analytics events are not added to local learning storage
- anonymous remote sharing is disabled
- existing local records remain until the user exports or clears them

The existing analytics sanitizer continues to exclude raw GPS, coordinates, typed addresses, Eircodes, destination/origin names, search text and free-text notes from anonymous event payloads.

Feedback is an explicit user action and can still be saved locally even when passive product analytics are off.

User controls:

- enable/disable local product analytics
- export local learning data
- clear local learning data

No governed remote analytics collector is configured by default.

## Founding Tester programme

Tester mode is designed to avoid collecting identity before XPLORE has a governed tester backend.

Local tester profile contains only:

- random pseudonymous tester ID
- creation timestamp
- broad device class
- selected testing focus areas
- explicit Beta acknowledgement
- whether local analytics was enabled at enrolment

It does not request name or email.

Focus areas:

- Search & addresses
- Route quality
- Decision Intelligence
- Live navigation
- Public transport
- Accessibility evidence
- Privacy controls

### Tester Pack

A tester can export a JSON pack containing:

- their pseudonymous local tester profile
- their user-initiated local learning export

Because optional feedback notes may exist in the local learning export, the UI explicitly asks the tester to review the pack before sharing it.

### Public bug form

A public GitHub Beta bug form is available for non-sensitive software/data-quality issues.

The form explicitly prohibits exact home/work locations, GPS coordinates, Eircodes and personal identifying journey details.

## Production monitoring

`.github/workflows/beta-monitor.yml` runs:

- hourly
- after a successful GitHub Pages deployment
- manually when needed

The monitor checks only public system data:

- homepage availability/release
- transit manifest availability/freshness
- GTFS shape metadata
- a deployed shape shard
- fare evidence boundary
- realtime manifest availability/status

It creates a seven-day GitHub Actions artifact containing the smoke report.

It does not query or receive:

- user GPS
- tester profiles
- local analytics
- local feedback
- addresses/searches

A failed critical smoke check fails the workflow, making GitHub Actions the current Beta alert surface.

## Client diagnostics

The Beta Readiness card performs lightweight public diagnostics from the user's browser:

- current app release
- transit service date
- active GTFS shape count
- monitoring configuration

This is diagnostic information, not telemetry.

## Known Beta limitations

The following remain explicit:

1. NTA GTFS-Realtime authenticated feed is architecturally integrated but the repository secret is not currently configured; NTA live mobility therefore remains Scheduled fallback.
2. Some routing/geocoding/context services are public/development adapters without production SLA.
3. Browser GPS cannot guarantee true screen-off/background navigation.
4. Transit planning is bounded to two transfers rather than an unrestricted national backend journey planner.
5. Fare values are reference evidence, not universal ticket quotes.
6. Route Intelligence is decision-support evidence, not safety/accessibility certification.
7. No user-account or governed remote tester/analytics backend is configured.

## Founding Tester release objective

The first tester cohort should prioritise evidence quality over volume.

Recommended Beta acceptance signals:

- zero knowingly wrong confirmed destinations in the validation set
- no stale route retained after destination change
- no critical privacy regression in automated tests
- public smoke monitor remains green
- transit data/shape refresh remains operational
- route/ETA/map/transit issues are captured through structured feedback
- qualitative preference for XPLORE recommendation vs simply fastest route can be measured

The Founding Tester programme should be expanded only after the first cohort demonstrates stable routing/search behaviour and useful feedback quality.
