# Future Live Data Integration

## Goal

Attach real-time departures and alerts while keeping frontend static on GitHub Pages.

## Pattern

1. Keep frontend runtime static
2. Fetch upstream live payloads at build/scheduled time
3. Normalize upstream payloads into frontend contracts
4. Write normalized outputs to:
- `data/departures.live.json`
- `data/alerts.live.json`
5. Let runtime adapters choose live vs sample vs schedule fallback

## Departures contract (live)

```json
{
  "meta": {
    "generatedAt": "2026-04-16T21:10:00+10:00"
  },
  "stops": {
    "BBS": [
      {
        "routeId": "GL",
        "headsign": "Helensvale",
        "expectedTime": "2026-04-16T21:12:00+10:00",
        "scheduledTime": "2026-04-16T21:11:00+10:00",
        "platform": "Tram B",
        "status": "on_time",
        "delayMinutes": 1
      }
    ]
  }
}
```

## Alerts contract (live)

```json
{
  "meta": {
    "generatedAt": "2026-04-16T21:10:00+10:00"
  },
  "alerts": [
    {
      "id": "ALERT-123",
      "region": "gold-coast",
      "level": "minor",
      "severity": 2,
      "title": "Route 700 delays",
      "description": "Up to 10 minute delays near Burleigh Heads.",
      "routes": ["700"],
      "stops": ["BURLEIGH"],
      "interchanges": ["gc-burleigh"],
      "effectiveFrom": "2026-04-16T20:00:00+10:00",
      "effectiveTo": "2026-04-16T23:00:00+10:00",
      "status": "active",
      "impact": "Traffic"
    }
  ]
}
```

## Included scripts

- `scripts/fetch-live-sources.mjs`
- `scripts/merge-live-feeds.mjs`
- `scripts/validate-data.mjs`

Typical flow:

```bash
npm run fetch:live -- --departures-source https://example.com/departures --alerts-source https://example.com/alerts
npm run merge:live -- --departures ./raw/live/departures.json --alerts ./raw/live/alerts.json --out ./data
npm run validate:data
```

## GitHub Actions automation

Workflow file: `.github/workflows/live-data-refresh.yml`

Repository secrets:

- `LIVE_DEPARTURES_SOURCE`
- `LIVE_ALERTS_SOURCE`
- optional `LIVE_HEADER_1..LIVE_HEADER_4` in format `Header-Name: value`

## Notes

- Respect upstream terms and rate limits
- Keep generated timestamps accurate for stale checks
- Keep disclaimers visible in UI and docs
- Never imply official reliability
