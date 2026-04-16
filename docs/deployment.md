# Deployment

## GitHub Pages (recommended)

### 1) Repository settings

- Repository: `AlexZander73/TransitHub`
- Pages source: Deploy from branch
- Branch: `main`
- Folder: `/ (root)`

The app is static and root-ready (`index.html` at repo root, `.nojekyll` present).

### 2) Optional GitHub Actions live refresh

Workflow: `.github/workflows/live-data-refresh.yml`

Set these repository secrets when ready:

- `LIVE_DEPARTURES_SOURCE`
- `LIVE_ALERTS_SOURCE`
- optional `LIVE_HEADER_1..LIVE_HEADER_4`

This workflow can fetch, normalize, validate, and commit refreshed live snapshot files.

### 3) Local sanity check before push

```bash
npm run validate:data
node --check assets/js/app.js
node --check assets/js/routesPage.js
node --check assets/js/stopsPage.js
node --check assets/js/alertsPage.js
```

## Local static serve

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Notes

- No Node runtime is needed in production hosting.
- Node scripts are build-time only.
- If deploying under a subpath later, update link/base path strategy in docs and URL-state helpers.
