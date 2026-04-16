# Future Live Data Integration

## Goal

Attach real-time departures and alerts while keeping frontend static on GitHub Pages.

## Static-first runtime pattern

1. Keep frontend runtime static.
2. Fetch upstream live payloads at build/scheduled time.
3. Normalize upstream payloads into frontend contracts.
4. Publish normalized snapshots to:
- `data/departures.live.json`
- `data/alerts.live.json`
5. Let runtime adapters choose live vs sample vs schedule fallback.

## Supported live ingestion paths

### 1. JSON snapshot path

Use this when upstream already provides JSON departures/alerts.

```bash
npm run fetch:live -- --departures-source https://example.com/departures --alerts-source https://example.com/alerts
npm run merge:live -- --departures ./raw/live/departures.json --alerts ./raw/live/alerts.json --out ./data
npm run validate:data
```

### 2. GTFS-RT path (protobuf or JSON)

Use this when upstream publishes GTFS-RT trip updates + service alerts feeds.

```bash
npm run fetch:gtfsrt -- \
  --trip-updates-source https://example.com/gtfsrt/trip-updates \
  --service-alerts-source https://example.com/gtfsrt/service-alerts \
  --trip-updates-format protobuf \
  --service-alerts-format protobuf

npm run build:live:gtfsrt -- \
  --trip-updates ./raw/live/trip-updates.pb \
  --service-alerts ./raw/live/service-alerts.pb \
  --mapping ./data/gtfs-id-map.json \
  --gtfs-stops ./raw/live/gtfs/stops.txt \
  --gtfs-routes ./raw/live/gtfs/routes.txt \
  --gtfs-trips ./raw/live/gtfs/trips.txt \
  --out ./data

npm run validate:data
```

## GTFS-RT mapping and enrichment

`build-live-from-gtfsrt.mjs` maps provider IDs into local route/stop IDs using:

1. Explicit map file (`data/gtfs-id-map.json`, optional).
2. Direct local ID match.
3. Optional GTFS static CSV lookup (`stops.txt`, `routes.txt`, `trips.txt`) using stop code/name and route short/long names.

Template file:
- `data/gtfs-id-map.sample.json`

## Live contracts

### Departures (`data/departures.live.json`)

```json
{
  "meta": {
    "generatedAt": "2026-04-17T00:10:00.000Z",
    "source": "build-live-from-gtfsrt.mjs"
  },
  "stops": {
    "BBS": [
      {
        "tripId": "trip-123",
        "routeId": "GL",
        "headsign": "Helensvale",
        "expectedTime": "2026-04-17T00:12:00.000Z",
        "scheduledTime": null,
        "epochSeconds": 1776403920,
        "inMinutes": 2,
        "platform": "Stop 7",
        "status": "on_time",
        "delayMinutes": 0
      }
    ]
  }
}
```

### Alerts (`data/alerts.live.json`)

```json
{
  "meta": {
    "generatedAt": "2026-04-17T00:10:00.000Z",
    "source": "build-live-from-gtfsrt.mjs"
  },
  "alerts": [
    {
      "id": "alert-456",
      "region": "brisbane",
      "level": "minor",
      "severity": 2,
      "title": "Platform notice",
      "description": "Follow temporary signage.",
      "routes": ["111"],
      "stops": ["EMPS"],
      "interchanges": ["bne-south-east"],
      "effectiveFrom": "2026-04-17T00:00:00.000Z",
      "effectiveTo": "2026-04-17T12:00:00.000Z",
      "status": "active",
      "impact": "MODIFIED SERVICE"
    }
  ]
}
```

## GitHub Actions automation

Workflow file: `.github/workflows/live-data-refresh.yml`

Set `LIVE_SOURCE_MODE` secret to:
- `json` (default behavior)
- `gtfsrt` (new GTFS-RT behavior)

### JSON-mode secrets
- `LIVE_DEPARTURES_SOURCE`
- `LIVE_ALERTS_SOURCE`
- optional `LIVE_HEADER_1..LIVE_HEADER_4`

### GTFS-RT-mode secrets
- `GTFSRT_TRIP_UPDATES_SOURCE`
- `GTFSRT_SERVICE_ALERTS_SOURCE`
- optional `GTFSRT_TRIP_UPDATES_FORMAT` (`protobuf` or `json`)
- optional `GTFSRT_SERVICE_ALERTS_FORMAT` (`protobuf` or `json`)
- optional `GTFS_STATIC_STOPS_SOURCE`, `GTFS_STATIC_ROUTES_SOURCE`, `GTFS_STATIC_TRIPS_SOURCE`
- optional `GTFS_ID_MAP_SOURCE`
- optional `LIVE_HEADER_1..LIVE_HEADER_4`

## Notes

- Respect upstream terms, licensing, and rate limits.
- Keep generated timestamps accurate for stale checks.
- Keep disclaimers visible in UI and docs.
- Never imply official reliability.
