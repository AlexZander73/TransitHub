# Future Live Data Integration

## Goal

Attach real-time departures/alerts without changing frontend architecture.

## Recommended pattern

1. Keep frontend static on GitHub Pages
2. Fetch upstream live payloads into raw artifacts
3. Normalize raw payloads to frontend contracts
4. Write normalized files to:
   - `data/departures.live.json`
   - `data/alerts.live.json`
5. Set `config.liveData.enabled = true`

The app already handles stale/missing live files and falls back automatically.

## Expected live departures contract

```json
{
  "meta": {
    "generatedAt": "2026-04-16T09:10:00+10:00"
  },
  "stops": {
    "BBS": [
      {
        "routeId": "GL",
        "headsign": "Helensvale",
        "expectedTime": "2026-04-16T09:12:00+10:00",
        "scheduledTime": "2026-04-16T09:11:00+10:00",
        "platform": "Tram B",
        "status": "on_time",
        "delayMinutes": 1
      }
    ]
  }
}
```

## Expected live alerts contract

```json
{
  "meta": {
    "generatedAt": "2026-04-16T09:10:00+10:00"
  },
  "alerts": [
    {
      "id": "ALERT-123",
      "level": "minor",
      "title": "Route 700 delays",
      "description": "Up to 10 minute delays near Burleigh Heads.",
      "routes": ["700"],
      "stops": ["BURLEIGH"],
      "effectiveFrom": "2026-04-16T08:00:00+10:00",
      "effectiveTo": "2026-04-16T12:00:00+10:00",
      "status": "active"
    }
  ]
}
```

## Build pipeline options

- **GitHub Actions**: fetch upstream feed every few minutes, normalize, commit/publish artifacts
- **Tiny proxy/API**: fetch and normalize on request, then cache to static JSON
- **Local cron script**: generate files and push updates manually

## Included scripts and workflow

- Fetch raw payloads:

```bash
node ./scripts/fetch-live-sources.mjs \
  --departures-source https://example.com/departures \
  --alerts-source https://example.com/alerts \
  --out-raw-dir ./raw/live
```

- Normalize payloads:

```bash
node ./scripts/merge-live-feeds.mjs \
  --departures ./raw/live/departures.json \
  --alerts ./raw/live/alerts.json \
  --out ./data
```

- Validate model:

```bash
node ./scripts/validate-data.mjs
```

- Automation file:
  - `.github/workflows/live-data-refresh.yml`
  - Scheduled every 15 minutes, plus manual trigger
  - Commits only when `data/departures.live.json` or `data/alerts.live.json` changed

## GitHub repository secrets for automation

- `LIVE_DEPARTURES_SOURCE` (URL or API endpoint)
- `LIVE_ALERTS_SOURCE` (URL or API endpoint)
- Optional headers:
  - `LIVE_HEADER_1`
  - `LIVE_HEADER_2`
  - `LIVE_HEADER_3`
  - `LIVE_HEADER_4`

Header format must be: `Header-Name: value`

A local template is included at `.env.live.example`.

## Important constraints

- Respect upstream API terms and rate limits
- Include licensing and attribution in About page and README
- Keep timestamps accurate so stale checks are meaningful
- Do not claim official reliability or affiliation
