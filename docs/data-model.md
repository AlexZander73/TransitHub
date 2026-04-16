# Data Model

## Files

Core runtime files:

- `data/config.json`
- `data/regions.json`
- `data/stops.json`
- `data/routes.json`
- `data/lines.json`
- `data/interchanges.json`
- `data/route-patterns.json`
- `data/direct-travel.sample.json`
- `data/departures.sample.json`
- `data/alerts.sample.json`
- `data/gtfs-id-map.sample.json` (optional template for GTFS-RT ID mapping)

Optional generated live files:

- `data/departures.live.json`
- `data/alerts.live.json`

## `config.json`

Defines runtime paths and behavior:

- `app`: name, tagline, timezone
- `regions`: enabled/planned/default region
- `ui`: default map mode and supported map modes
- `dataPaths`: file locations for all runtime datasets
- `liveData`: enable flags and live snapshot paths
- `fallback`: departure limit/lookahead/no-data copy
- `map`: viewBox + zoom config
- `disclaimer` + `privacy`

## `regions.json`

Region catalog for selector + expansion state.

Current sample coverage:

- `gold-coast` (`active`)
- `brisbane` (`active`)
- `logan` (`preview`)
- additional planned regions for future expansion

Example:

```json
{
  "id": "gold-coast",
  "label": "Gold Coast",
  "status": "active",
  "default": true,
  "description": "Flagship region",
  "mapViewport": { "focus": { "x": 620, "y": 840, "zoom": 1 } }
}
```

## `stops.json`

Stop/station/interchange nodes.

Example:

```json
{
  "id": "BBS",
  "region": "gold-coast",
  "name": "Broadbeach South Interchange",
  "code": "BBS",
  "type": "interchange",
  "modes": ["tram", "bus", "interchange"],
  "lat": -28.0348,
  "lon": 153.4202,
  "map": { "x": 770, "y": 1275 },
  "routes": ["GL", "700", "777", "760"],
  "interchangeId": "gc-broadbeach",
  "nearbyStopIds": ["BBN", "PFI", "BURLEIGH"]
}
```

## `routes.json`

Route definitions and service profiles.

Key fields:

- `region`, `lineId`, `family`
- `shortName`, `longName`, `mode`, `color`
- `stopSequence`, `segmentMinutes`
- `serviceSpan`
- `directions[]`
- `status` (`active`, `preview`)

## `lines.json`

Map line overlays.

Key fields:

- `id`, `region`, `mode`, `color`
- `routeIds`
- `layer` (`primary`, `corridor`, `secondary`)
- `path[]` points for SVG rendering

## `interchanges.json`

Grouped transfer nodes and relationships.

Key fields:

- `id`, `region`, `name`, `type`
- `stopIds`
- `connectedInterchanges`
- `notes`

## `route-patterns.json`

Simplified variants for route detail + direct eligibility context.

Key fields:

- `id`, `routeId`, `region`, `directionId`
- `name`, `headsign`
- `stopSequence`
- `serviceWindow`
- `sampleTripMinutes`

## `direct-travel.sample.json`

Direct-estimate support edges.

Example:

```json
{
  "origin": "HEL",
  "destination": "BBS",
  "routeId": "GL",
  "region": "gold-coast",
  "minutes": 47,
  "distanceKm": 21.0,
  "confidence": "high",
  "bidirectional": true
}
```

If no edge exists, frontend can derive same-route estimates from `segmentMinutes`.

## `departures.sample.json`

Snapshot departures by stop key. Supported entry input forms in adapter:

- `inMinutes`
- `expectedTime` (ISO)
- `scheduledTime` (ISO)
- `epochSeconds`

## `alerts.sample.json`

Alert notices with targeting and severity:

- `region`, `level`, `severity`
- `routes`, `stops`, `interchanges`
- `effectiveFrom`, `effectiveTo`, `status`
- `impact`

## Live files contract

Live files follow the same functional shape as sample files and are treated as optional runtime sources.

## `gtfs-id-map.sample.json`

Template for explicit provider ID mapping during GTFS-RT ingestion.

Main sections:

- `routes`: provider route ID -> local route ID
- `stops`: provider stop ID -> local stop ID
- `tripHeadsigns`: optional trip headsign overrides by trip ID
