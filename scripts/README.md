# Scripts

Build-time scripts for data transformation, live snapshot normalization, and validation.

## Files

- `fetch-live-sources.mjs`: fetches raw departures/alerts JSON from URL or local source into `raw/live`.
- `transform-gtfs.mjs`: imports GTFS static files and generates region-ready core data files (`stops/routes/lines/regions/interchanges/route-patterns`).
- `merge-live-feeds.mjs`: normalizes external live payloads into `departures.live.json` and `alerts.live.json`.
- `validate-data.mjs`: validates required files and cross-file references.

## Typical usage

```bash
npm run validate:data
npm run build:gtfs -- --input ./raw/gtfs --output ./data
npm run fetch:live -- --departures-source https://example.com/departures --alerts-source https://example.com/alerts
npm run merge:live -- --departures ./raw/live/departures.json --alerts ./raw/live/alerts.json --out ./data
npm run refresh:live
```

## Notes

- Scripts are optional build-time workflows only.
- Deployed frontend remains static and does not require Node.
- `fetch-live-sources.mjs` supports env vars:
  - `LIVE_DEPARTURES_SOURCE`
  - `LIVE_ALERTS_SOURCE`
  - `LIVE_HEADER_1..LIVE_HEADER_4` (`Header-Name: value`)
