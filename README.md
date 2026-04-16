# CoastPulse Transit Atlas

CoastPulse Transit Atlas is an **unofficial**, static-first, map-centric transit information website focused on **Gold Coast first**, with active scaffolding for **Brisbane** and broader SEQ expansion.

It is designed to run directly on **GitHub Pages**.

## Important disclaimer

This is a personal unofficial project and is **not affiliated with Translink** or the Queensland Government.

Times, alerts, and direct travel estimates may be delayed, incomplete, unavailable, or approximate. Always verify critical travel decisions via official channels.

## What this build delivers

## Core map experience

- Premium map-first homepage with stylized SVG network map
- Region switcher (Gold Coast + Brisbane preview)
- Map mode toggles (`stylized`, `corridor`, `connections`)
- Clickable stops, stations, and interchange nodes
- Route overlay highlighting and route legend interactions
- Pan/zoom with keyboard-friendly search shortcuts

## Stop intelligence

- Rich stop panel with stop type, modes, coordinates, and links
- Upcoming departures with countdowns and source labels (`Live`, `Sample`, `Schedule`)
- Stop-level and route-level alerts in context
- Nearby linked stops + connected interchange notes
- External map links (Google Maps, satellite, OpenStreetMap)
- Share stop link + copy coordinates

## Route intelligence

- Route index page with region switch + search
- Route detail with direction/service windows and stop sequence timing
- Route variant/pattern visibility from `route-patterns.json`
- Save route and share route link behaviors

## Planner-lite (honest scope)

- Direct-trip estimate only (same-route / supported direct edge)
- Next departure + estimated arrival when available
- Distance proxy + confidence label where modeled
- Transparent unsupported messaging for transfer-capable pairs
- No fake transfer pathfinding

## Alerts and discovery

- Dedicated alerts page (active + recent) with severity filter
- Improved stop/route search with keyboard navigation and recent searches
- Stops index page with detail panel and quick map jump links

## Local-only personalization

Stored in browser localStorage only:

- pinned/favorite stops
- saved routes
- recent stops
- recent routes
- recent search history
- recent direct-trip pairs

No accounts or server-side profiles.

## Stack

- Plain HTML/CSS/JavaScript modules
- Static JSON data in `/data`
- Optional Node scripts for build-time transforms/validation/live-merge
- No runtime backend

## Project structure

```text
/
  index.html
  stops.html
  routes.html
  alerts.html
  data.html
  about.html
  how-it-works.html
  assets/
    css/styles.css
    js/
      app.js
      stopsPage.js
      routesPage.js
      alertsPage.js
      services/
      state/
      ui/
      utils/
  data/
    config.json
    regions.json
    stops.json
    routes.json
    lines.json
    interchanges.json
    route-patterns.json
    departures.sample.json
    alerts.sample.json
    direct-travel.sample.json
    departures.live.json         # optional generated snapshot
    alerts.live.json             # optional generated snapshot
  scripts/
    fetch-live-sources.mjs
    merge-live-feeds.mjs
    transform-gtfs.mjs
    validate-data.mjs
  docs/
    architecture.md
    data-model.md
    future-live-data.md
    design-notes.md
    deployment.md
    roadmap.md
    content-guidelines.md
    accessibility-notes.md
  .github/workflows/live-data-refresh.yml
  README.md
```

## Local development

Serve static files:

```bash
python3 -m http.server 4173
```

Open: [http://localhost:4173](http://localhost:4173)

Validation and checks:

```bash
npm run validate:data
node --check assets/js/app.js
node --check assets/js/routesPage.js
node --check assets/js/stopsPage.js
node --check assets/js/alertsPage.js
```

## GitHub Pages deployment

Repository: `AlexZander73/TransitHub`

1. Push changes to `main`
2. GitHub repo Settings -> Pages
3. Source: Deploy from branch
4. Branch: `main`, Folder: `/ (root)`

The deployed frontend needs no Node runtime.

## Data model and runtime behavior

Runtime is configured by `data/config.json`.

Primary runtime files:

- `regions.json`
- `stops.json`
- `routes.json`
- `lines.json`
- `interchanges.json`
- `route-patterns.json`
- `direct-travel.sample.json`
- `departures.sample.json`
- `alerts.sample.json`

Detailed contracts:

- `docs/data-model.md`
- `docs/architecture.md`

## Live vs sample vs schedule

Departure/alert adapters follow this order:

1. live snapshot JSON (if enabled and fresh)
2. sample snapshot JSON
3. schedule-derived departures (departures only)

Status text in UI explicitly reports fallback state.

## Replacing sample data later

### GTFS import

```bash
npm run build:gtfs -- --input ./raw/gtfs --output ./data
```

### Live snapshot pipeline

```bash
npm run fetch:live -- --departures-source https://example.com/departures --alerts-source https://example.com/alerts
npm run merge:live -- --departures ./raw/live/departures.json --alerts ./raw/live/alerts.json --out ./data
npm run validate:data
```

Optional automation is included in `.github/workflows/live-data-refresh.yml`.

## What is mocked vs implemented

Implemented:

- multi-region static data model and region switching
- map interactions and route/stop overlays
- departures/alerts adapter chain and fallback UI
- direct-only trip estimation with explicit boundaries
- favorites/recents/deep-link state

Representative sample/mocked data:

- many route timings, departures, and alerts are modeled samples
- Brisbane coverage is scaffold-level preview

## Deep links

URL state supports:

- `region`
- `stop`
- `route`
- `origin`
- `destination`
- `compareStop`
- `mapMode`
- mode filters (`tram`, `bus`, `interchange`)

## Intentionally out of scope

- Full transfer planner with arbitrary walking links
- Fare engine
- Accessibility routing engine
- Account/login/admin/CMS

## Docs index

- [Architecture](./docs/architecture.md)
- [Data model](./docs/data-model.md)
- [Future live data](./docs/future-live-data.md)
- [Design notes](./docs/design-notes.md)
- [Deployment](./docs/deployment.md)
- [Roadmap](./docs/roadmap.md)
- [Content guidelines](./docs/content-guidelines.md)
- [Accessibility notes](./docs/accessibility-notes.md)

## Attribution checklist before public launch

- Add exact open-data license attribution text
- Add official source URLs and terms
- Verify third-party asset licensing
- Keep disclaimer and non-affiliation copy visible
