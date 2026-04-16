# Scripts

Build-time scripts for static data transformation, live snapshot normalization, GTFS-RT ingestion, and data validation.

## Files

- `fetch-live-sources.mjs`: fetch raw departures/alerts JSON from URL or local source into `raw/live`.
- `merge-live-feeds.mjs`: normalize external JSON payloads into `departures.live.json` and `alerts.live.json`.
- `fetch-gtfsrt-sources.mjs`: fetch GTFS-RT trip updates/service alerts (protobuf or JSON), optional static GTFS tables, and optional ID mapping into `raw/live`.
- `build-live-from-gtfsrt.mjs`: decode and normalize GTFS-RT feeds into frontend live contracts using optional static GTFS lookup tables and ID mapping.
- `transform-gtfs.mjs`: import GTFS static files and generate region-ready core data files (`stops/routes/lines/regions/interchanges/route-patterns`).
- `validate-data.mjs`: validate required files and cross-file references.

## Typical usage

### JSON snapshot workflow

```bash
npm run fetch:live -- --departures-source https://example.com/departures --alerts-source https://example.com/alerts
npm run merge:live -- --departures ./raw/live/departures.json --alerts ./raw/live/alerts.json --out ./data
npm run validate:data
```

### GTFS-RT workflow (protobuf or JSON feeds)

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

### One-command refresh

```bash
npm run refresh:live
npm run refresh:live:gtfsrt
```

## Notes

- Scripts are optional build-time workflows only.
- Deployed frontend remains static and does not require Node.
- `data/gtfs-id-map.sample.json` can be copied to `data/gtfs-id-map.json` for explicit provider-ID mapping.
- Header auth is supported in fetch scripts via `LIVE_HEADER_1..LIVE_HEADER_4` (`Header-Name: value`).
