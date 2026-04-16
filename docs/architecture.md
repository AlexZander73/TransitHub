# Architecture

## Summary

CoastPulse Transit Atlas is a static-first transit web application designed for GitHub Pages deployment with no runtime backend.

Core characteristics:

- Static HTML/CSS/JS frontend
- JSON datasets committed under `/data`
- Optional build-time Node scripts for GTFS transforms and live snapshot normalization
- Graceful fallback from live snapshots to sample snapshots to schedule-derived estimates

## Runtime layers

1. Presentation layer
- `index.html` (map-first experience)
- `stops.html`, `routes.html`, `alerts.html`, `data.html`, `about.html`, `how-it-works.html`
- `assets/css/styles.css`

2. App orchestration
- `assets/js/app.js` (main map/state orchestration)
- `assets/js/stopsPage.js`
- `assets/js/routesPage.js`
- `assets/js/alertsPage.js`

3. UI modules
- `assets/js/ui/mapView.js`
- `assets/js/ui/searchController.js`
- `assets/js/ui/templates.js`

4. State and URL
- `assets/js/state/store.js`
- `assets/js/services/urlStateService.js`

5. Data services
- `assets/js/services/transitDataService.js`
- `assets/js/services/stopsService.js`
- `assets/js/services/routesService.js`
- `assets/js/services/departuresService.js`
- `assets/js/services/alertsService.js`
- `assets/js/services/plannerLiteService.js`
- `assets/js/services/storageService.js`

6. Utility helpers
- `assets/js/utils/network.js`
- `assets/js/utils/time.js`

## State model (map page)

Primary state dimensions:

- Region: selected region (`gold-coast` / `brisbane` / `logan` preview)
- Map mode: `stylized`, `corridor`, `connections`
- Selection: stop, route, compare-stop
- Trip estimate context: origin, destination, estimate result
- Filters: tram, bus, interchange
- Data surfaces: departures, alerts, network alert summaries
- Local persistence: favorites and recents (via localStorage)

## Fallback strategy

Departures and alerts follow a fixed fallback chain:

1. Live JSON snapshots (if enabled and fresh)
2. Sample snapshot JSON
3. Schedule-derived departures (for departure boards)

UI always displays source-aware status messaging rather than failing silently.

Build-time live generation now supports two upstream modes:

1. JSON snapshot merge (`fetch-live-sources` + `merge-live-feeds`)
2. GTFS-RT decode/normalize (`fetch-gtfsrt-sources` + `build-live-from-gtfsrt`)

## Direct-estimate boundaries

`plannerLiteService` intentionally supports only:

- Explicit direct edges from `direct-travel.sample.json`
- Same-route direct calculations from route stop sequence + segment timings

If direct support is unavailable, the UI returns:

- `TRANSFER_CAPABLE` for interchange-linked stop pairs (informative, no fake routing)
- `NO_DIRECT_ROUTE` otherwise

No full transfer pathfinding or walking/fare logic is attempted.

## Multi-region model

The runtime bundle is region-aware:

- `regions.json`
- region-tagged stops/routes/lines/interchanges/patterns

`TransitDataService` builds region indexes (`stopsByRegion`, `routesByRegion`, `linesByRegion`) so region switching is a state change, not a frontend rewrite.

Current data coverage:

- Gold Coast (active, flagship)
- Brisbane (active expanded sample)
- Logan (preview expanded sample)

## GitHub Pages compatibility

- All frontend assets are static and path-safe for repository root deployment
- No client-side server APIs are required at runtime
- Optional Node scripts and GitHub Actions are build-time only
