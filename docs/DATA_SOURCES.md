# XPLORE v0.2 Data Adapters

The current Cork pilot intentionally separates external data providers from XPLORE's decision logic.

## Map tiles
Development: OpenStreetMap standard tiles via Leaflet.

Production boundary: do not treat the public OSM tile service as an enterprise CDN. Move behind an approved commercial tile provider or self-hosted tile infrastructure with correct OpenStreetMap attribution and usage compliance.

## Geocoding
Development: public Nominatim search endpoint, invoked only when the user explicitly submits a route.

Important constraints:
- no client-side autocomplete against the public service
- low-volume development only
- attribution required
- production/commercial use should use a governed provider or self-hosted Nominatim instance

## Routing
Development adapters:
- driving: OSRM public demo
- cycling: openstreetmap.de OSRM bike demo
- walking: openstreetmap.de OSRM foot demo

Production boundary: provider URLs must be configuration, not product logic. The internal route-candidate schema stays stable when providers change.

## Weather
Development: Open-Meteo Forecast API using route-midpoint coordinates.

Current variables:
- temperature at 2 m
- precipitation
- wind speed at 10 m

## Air quality
Development: Open-Meteo Air Quality API / CAMS-backed European AQI using route-midpoint coordinates.

Current variables:
- European AQI
- PM2.5

Production work must review commercial/licensing requirements and required source acknowledgements for every provider.

## Community Truth
Current build: prototype signals only.

Next implementation requires a persisted observation model with source, timestamp, precision, verification state, confidence and expiry. Community reports must not immediately influence safety-critical routing without corroboration.

## XPLORE-owned logic
Provider-independent and intended to remain product IP:
- normalised route-candidate representation
- preference weighting
- route quality scoring
- journey confidence
- context penalties/bonuses
- structured "Why this route?" explanations

No external provider's ranking is presented as the XPLORE recommendation without passing through the XPLORE decision layer.
