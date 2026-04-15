# Scripts

Build-time scripts for data transformation and validation.

## Files

- `fetch-live-sources.mjs`: fetches raw departures/alerts JSON from URL or local source into `raw/live`.
- `transform-gtfs.mjs`: imports GTFS static files and generates `stops.json`, `routes.json`, and `lines.json`.
- `merge-live-feeds.mjs`: normalizes external live feed payloads into `departures.live.json` and `alerts.live.json`.
- `validate-data.mjs`: checks required data files and cross-file references.

## Typical usage

```bash
npm run validate:data
npm run build:gtfs -- --input ./raw/gtfs --output ./data
npm run fetch:live -- --departures-source https://example.com/departures --alerts-source https://example.com/alerts
npm run merge:live -- --departures ./raw/live/departures.json --alerts ./raw/live/alerts.json --out ./data
npm run refresh:live
```

## Notes

- These scripts are optional for local build-time workflows only.
- The deployed frontend remains static and does not require Node at runtime.
- `fetch-live-sources.mjs` also supports environment variables:
  - `LIVE_DEPARTURES_SOURCE`
  - `LIVE_ALERTS_SOURCE`
  - `LIVE_HEADER_1..LIVE_HEADER_4` (format `Header-Name: value`)
- See `.env.live.example` for a local template.
- `refresh:live` is a convenience chain: fetch -> merge -> validate (expects `LIVE_DEPARTURES_SOURCE` and/or `LIVE_ALERTS_SOURCE` to be set).
