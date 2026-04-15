# Architecture

## Summary

CoastPulse Transit uses a static-first architecture designed for GitHub Pages:

- Static frontend (`HTML/CSS/JS` modules)
- Static data JSON in `/data`
- Optional build-time scripts in `/scripts`
- Optional live JSON adapters with graceful fallback

No server runtime is required for the deployed site.

## Runtime layers

1. **Presentation layer**
   - `index.html`, `routes.html`, static content pages
   - `assets/css/styles.css`

2. **App orchestration**
   - `assets/js/app.js` (map page)
   - `assets/js/routesPage.js` (route details page)

3. **State and UI modules**
   - `state/store.js`
   - `ui/mapView.js`
   - `ui/searchController.js`
   - `ui/templates.js`

4. **Data/services layer**
   - `services/transitDataService.js`
   - `services/departuresService.js`
   - `services/alertsService.js`
   - `services/routePlannerLite.js`

5. **Data assets**
   - Stops, routes, lines, departures sample, alerts sample, direct-travel edges, config

6. **Optional automation**
   - `scripts/fetch-live-sources.mjs`
   - `scripts/merge-live-feeds.mjs`
   - `.github/workflows/live-data-refresh.yml`

## Fallback strategy

Departure and alert flow is intentionally resilient:

1. Try optional live JSON (`data/departures.live.json`, `data/alerts.live.json`) when enabled in `config.json`
2. If unavailable/stale, use `departures.sample.json` / `alerts.sample.json`
3. If departures are still missing, generate scheduled estimates from route frequency profiles
4. Always show a user-visible status banner for source/fallback mode

## Direct travel estimate scope

`routePlannerLite` only supports direct trips where:

- explicit edge exists in `direct-travel.sample.json`, or
- origin/destination are both on the same route stop sequence

If neither condition is met, the UI returns a clear “direct estimate unavailable” state. No transfer pathfinding is attempted.

## Region expansion path

The model is region-tagged (`region` fields in stops/routes/lines).

To add Brisbane/SEQ later:

- Add new region datasets and map shapes
- Extend `config.regions`
- Introduce region switcher in UI
- Keep existing service and state patterns intact

No rewrite is required if data contracts stay stable.
