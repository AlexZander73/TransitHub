# Capacitor Guide

## Goal

Run CoastPulse Transit Atlas as a native iOS/Android shell without changing the static-first architecture.

## What is included

- `capacitor.config.ts` with `webDir: mobile/www`
- `scripts/build-capacitor-web.mjs` to package static assets for mobile
- NPM scripts for add/sync/open workflows
- Safe-area + viewport bootstrap (`assets/js/bootstrap.js`)

## Quick start

```bash
npm install
npm run cap:add:ios
npm run cap:add:android
npm run cap:sync
```

Open native projects:

```bash
npm run cap:open:ios
npm run cap:open:android
```

## Ongoing workflow

After any frontend or data update:

```bash
npm run cap:sync
```

This rebuilds `mobile/www` and syncs the native projects.

## Notes and limitations

- App remains unofficial and must keep disclaimer content visible.
- External tile layers and live snapshots require network connectivity.
- If tile scripts or tile network fail, the stylized SVG fallback map still works.
- Native platform directories (`ios/`, `android/`) are generated only after running `cap:add:*`.
