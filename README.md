# CoastPulse Transit (MVP)

CoastPulse Transit is an **unofficial**, map-first public transit website focused on the **Gold Coast** first, with architecture ready to expand into Brisbane and surrounding SEQ areas.

This repository ships a complete static MVP optimized for GitHub Pages:

- Custom stylized transit map (SVG, top-down)
- Clickable tram stops and major bus interchange nodes
- Route overlays and route highlight states
- Stop detail panel with departures, alerts, and map jump links
- Direct-only travel time estimates between valid connected stops
- Live-data adapter layer with clear static/scheduled fallback behavior

## Important disclaimer

This is a personal unofficial project. It is **not affiliated with Translink**.

Times, alerts, and direct travel estimates may be delayed, incomplete, unavailable, or approximate. Always verify critical travel decisions via official sources.

## Feature summary

- Gold Coast-first network coverage with realistic sample data
  - G:link tram spine
  - Helensvale and major interchange nodes
  - Selected key bus connectors
- Map interactions
  - Select stop
  - Select/highlight route
  - Pan/zoom controls
  - Mode filtering (tram/bus/interchange)
- Stop detail UI
  - Modes, code, routes at stop
  - Next departures + countdowns
  - Alert/disruption section
  - Open in Google Maps / satellite links
  - Copy coordinates / share stop link
- Direct travel estimator (intentionally limited scope)
  - Origin/destination selection
  - Direct-route-only estimates
  - Clear unsupported state when transfer journey is required
- Search
  - Stop name/code
  - Route number/name
- Resilience
  - Optional live JSON
  - Sample snapshot fallback
  - Scheduled fallback generation

## Stack

- Plain HTML/CSS/JavaScript modules
- Static JSON data in `/data`
- Optional Node build-time scripts in `/scripts`
- No runtime backend

## Folder structure

```text
/
  index.html
  routes.html
  about.html
  how-it-works.html
  assets/
    css/styles.css
    js/
      app.js
      routesPage.js
      services/
      state/
      ui/
      utils/
  data/
    config.json
    stops.json
    routes.json
    lines.json
    departures.sample.json
    alerts.sample.json
    direct-travel.sample.json
  scripts/
    fetch-live-sources.mjs
    transform-gtfs.mjs
    merge-live-feeds.mjs
    validate-data.mjs
  docs/
    architecture.md
    data-model.md
    future-live-data.md
  package.json
  README.md
```

## Local development

### Option 1: Python static server

```bash
python3 -m http.server 4173
```

Open: [http://localhost:4173](http://localhost:4173)

### Option 2: npm script

```bash
npm run serve
```

### Validate data

```bash
npm run validate:data
```

### Refresh live artifacts locally

```bash
npm run fetch:live -- --departures-source https://example.com/departures --alerts-source https://example.com/alerts
npm run merge:live
npm run validate:data
```

Or, if `LIVE_DEPARTURES_SOURCE` / `LIVE_ALERTS_SOURCE` env vars are already set:

```bash
npm run refresh:live
```

An example environment template is provided in `.env.live.example`.

## GitHub Pages deployment

This project is static-hosting friendly by default.

1. Push to GitHub repository
2. In repository settings, enable Pages
3. Set source to deploy from branch (typically `main`) and root (`/`)
4. Ensure `index.html` is at repository root (already true)

No Node runtime is required for hosted frontend.

## How data works

Runtime data paths are configured in `data/config.json`.

### Core data files

- `stops.json`: stop/interchange metadata + map coordinates
- `routes.json`: route definitions + stop sequence + service profiles
- `lines.json`: map overlay polylines + route associations
- `direct-travel.sample.json`: direct edge overrides for travel estimates
- `departures.sample.json`: sample departure snapshots
- `alerts.sample.json`: sample alert notices

Detailed contracts are documented in:

- `docs/data-model.md`
- `docs/architecture.md`

## Live vs mocked behavior

Current default setup is static-first with representative sample data:

- `config.liveData.enabled` is `false`
- Departures and alerts use sample/scheduled fallback logic

When ready, you can enable live mode by generating:

- `data/departures.live.json`
- `data/alerts.live.json`

Then set `config.liveData.enabled` to `true`.

Integration details: `docs/future-live-data.md`

## Replacing sample data with real feeds later

1. Import GTFS static data with:

```bash
npm run build:gtfs -- --input ./raw/gtfs --output ./data
```

2. Normalize live feeds with:

```bash
npm run merge:live -- --departures ./raw/live/departures.json --alerts ./raw/live/alerts.json --out ./data
```

3. Optionally automate refresh using `.github/workflows/live-data-refresh.yml` and repository secrets:
   - `LIVE_DEPARTURES_SOURCE`
   - `LIVE_ALERTS_SOURCE`
   - optional auth headers `LIVE_HEADER_1..LIVE_HEADER_4` (`Header-Name: value`)
4. Enable live mode in `data/config.json`
5. Run `npm run validate:data`
6. Commit updated `/data` artifacts and deploy

## What is intentionally out of scope in this MVP

- Full transfer journey planner
- Walking transfer timing logic
- Fare calculation
- Accessibility routing engine
- Account/login/admin features

## Roadmap

- Region switcher and Brisbane dataset onboarding
- Better route direction handling and route variants
- Optional favorites and pinned stops
- Optional print-friendly stop/route sheets
- Improved live feed freshness indicators

## Attribution and compliance checklist (before public launch)

- Add exact open-data attribution text and license references
- Add live feed source and terms references
- Verify third-party asset licensing
- Keep disclaimer copy visible in UI and About page

## Architecture docs

- [Architecture](./docs/architecture.md)
- [Data model](./docs/data-model.md)
- [Future live data](./docs/future-live-data.md)
