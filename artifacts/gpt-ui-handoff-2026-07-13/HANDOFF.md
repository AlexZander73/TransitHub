# CoastPulse UI Overhaul Handoff

## Purpose

This package is evidence and context for a design-focused GPT to define the next visual overhaul of CoastPulse Transit Atlas. The output should be a concrete design blueprint that can be handed back to Codex for implementation in this repository.

Do not redesign from a product name alone. Review the screenshots, current interactions, architecture, and constraints below. Make decisions that improve the actual application rather than producing a generic transit moodboard.

## Product and Goal

CoastPulse Transit Atlas is a free, unofficial, map-first transit companion for South East Queensland, initially focused on the Gold Coast. It combines a real Leaflet map with stops, route overlays, departures, alerts, direct-trip estimates, saved items, and static fallback data.

The owner wants people to enjoy using the app even though it is free. The next design should feel polished, trustworthy, locally relevant, and premium without becoming decorative or obstructing quick transit tasks.

Primary design goals:

1. Keep the map as the visual center of the product.
2. Make map tools icon-led, immediately understandable, and comfortable to use one-handed.
3. Use translucent map overlays selectively, with strong legibility and predictable expansion behavior.
4. Keep a five-destination phone navigation bar: Map, Stops, Routes, Alerts, More.
5. Make every destination feel like the same product, not a return to an older website.
6. Remove overlap, clipping, excess density, and competing navigation.
7. Improve geographic confidence and clearly distinguish visual design work from data accuracy work.
8. Retain a respectful, optional tip jar without dark patterns.

## Screenshot Evidence

All screenshots are in [`screenshots/`](./screenshots/). Phone captures use 375x812, 390x844, or 416x viewport sizes. Desktop captures use approximately 1425x891 or 1440x900. Full-page captures are taller than the viewport.

### Phone: map states

| File | State |
| --- | --- |
| [`01-phone-map-default.jpg`](./screenshots/01-phone-map-default.jpg) | Default map, search, map tools, details trigger, bottom navigation |
| [`02-phone-map-region-menu.jpg`](./screenshots/02-phone-map-region-menu.jpg) | Region menu open |
| [`03-phone-map-layers-menu.jpg`](./screenshots/03-phone-map-layers-menu.jpg) | Layers menu open |
| [`04-phone-map-filter-menu.jpg`](./screenshots/04-phone-map-filter-menu.jpg) | Transit mode filter open |
| [`05-phone-map-details-sheet.jpg`](./screenshots/05-phone-map-details-sheet.jpg) | Generic details sheet expanded |
| [`06-phone-map-search-results.jpg`](./screenshots/06-phone-map-search-results.jpg) | Search results for Helensvale |
| [`07-phone-map-stop-details-expanded.jpg`](./screenshots/07-phone-map-stop-details-expanded.jpg) | Selected stop with expanded detail stack |
| [`08-phone-map-stop-selected.jpg`](./screenshots/08-phone-map-stop-selected.jpg) | Selected stop with compact details state |

### Phone: destinations and supporting pages

| File | State |
| --- | --- |
| [`09-phone-stops-list.jpg`](./screenshots/09-phone-stops-list.jpg) | Stops list |
| [`10-phone-stops-detail.jpg`](./screenshots/10-phone-stops-detail.jpg) | Stop detail after selecting an item |
| [`11-phone-routes-list.jpg`](./screenshots/11-phone-routes-list.jpg) | Routes list |
| [`12-phone-routes-detail.jpg`](./screenshots/12-phone-routes-detail.jpg) | Route detail after selecting an item |
| [`13-phone-alerts-top.jpg`](./screenshots/13-phone-alerts-top.jpg) | Alerts first viewport |
| [`14-phone-alerts-full.jpg`](./screenshots/14-phone-alerts-full.jpg) | Full alerts page |
| [`15-phone-more-top.jpg`](./screenshots/15-phone-more-top.jpg) | More and tip jar first viewport |
| [`16-phone-more-full.jpg`](./screenshots/16-phone-more-full.jpg) | Full More page |
| [`17-phone-how-it-works-full.jpg`](./screenshots/17-phone-how-it-works-full.jpg) | Full How It Works page |
| [`18-phone-data-full.jpg`](./screenshots/18-phone-data-full.jpg) | Full Data and Sources page |

### Desktop

| File | State |
| --- | --- |
| [`19-desktop-map-default.jpg`](./screenshots/19-desktop-map-default.jpg) | Default map with persistent right detail rail |
| [`20-desktop-map-layers-menu.jpg`](./screenshots/20-desktop-map-layers-menu.jpg) | Layers menu open |
| [`21-desktop-map-route-selected.jpg`](./screenshots/21-desktop-map-route-selected.jpg) | Route 700 selected on the map |
| [`22-desktop-stops.jpg`](./screenshots/22-desktop-stops.jpg) | Stops list/detail layout |
| [`23-desktop-routes.jpg`](./screenshots/23-desktop-routes.jpg) | Routes list/detail layout |
| [`24-desktop-alerts.jpg`](./screenshots/24-desktop-alerts.jpg) | Alerts layout |
| [`25-desktop-more.jpg`](./screenshots/25-desktop-more.jpg) | More and tip jar layout |
| [`26-desktop-how-it-works-full.jpg`](./screenshots/26-desktop-how-it-works-full.jpg) | How It Works page |
| [`27-desktop-data-full.jpg`](./screenshots/27-desktop-data-full.jpg) | Data and Sources page |

Browser QA found no console warnings or errors while these states were captured. At 375 px viewport width, Map, Stops, Routes, Alerts, More, and Data do not create document-level horizontal scrolling. How It Works has a real 56 px overflow from the unbreakable `regions/stops/routes/lines/interchanges/patterns` code token.

## Current Strengths

- The phone map is now genuinely map-first and immediately communicates the product.
- The bottom phone navigation is consistent across the primary destinations.
- Route color is useful and gives the map more personality than a monochrome treatment.
- Search, map selection, layers, filters, stop detail, route detail, and alerts are functional.
- The More page has a clearer voice and the tip jar is optional, transparent, and visually distinct.
- The app icon is present in the header and More page, filling the previous blank brand area.
- The UI generally uses restrained 8 px radii and avoids excessive decorative illustration.

## Main Problems to Solve

### 1. Map hierarchy and occlusion

- The brand header, search, three map tool buttons, zoom controls, bottom navigation, and details trigger all compete over the same map.
- On a phone, the upper overlays consume roughly the first 180 px before the user reaches unobstructed map content.
- Region, Layers, and Filter panels are mechanically functional but feel like web form panels. Region still resolves to a standard select rather than a fast icon or sheet-based choice.
- Expanding details produces a stack of translucent boxes. The hierarchy between status, legend, stop information, trip tools, departures, and disclaimers is weak.
- On desktop, the permanent right rail is dense and generic. After choosing a route, the map changes but the panel does not make the selected route the primary context strongly enough.
- Desktop navigation should not blindly duplicate the phone bottom bar if a top or side navigation pattern is clearer.

### 2. Product continuity across destinations

- Map feels like an app; Stops and Routes feel like traditional split-pane web utilities.
- On phone, selecting an item scrolls down to a long detail card. A native-feeling detail sheet, drill-in view, or persistent split mode would provide better continuity and clearer back behavior.
- Alerts are readable but visually repetitive. Severity, affected route, timing, and action need stronger scan hierarchy.
- More is currently the most branded secondary page, but its visual language does not yet extend back through Stops, Routes, and Alerts.
- How It Works and Data are implementation-heavy documentation pages. They need consumer-friendly summaries with technical detail progressively disclosed or moved to project documentation.

### 3. Density and component structure

- Many surfaces are represented as separate cards or card-like boxes, especially in expanded map details.
- Long route and stop details lack a concise, prioritized summary above supporting information.
- Buttons remain text-heavy in places where familiar icons with tooltips would be clearer.
- Desktop layouts leave broad unused background areas while dense information is confined inside white panels.
- Typography is readable but not yet distinctive or strongly hierarchical enough to create a premium product feel.

### 4. Geographic trust

This is not only a visual issue. The current data is explicitly representative sample data. Leaflet route overlays are created by drawing straight polylines through each route's `stopSequence` coordinates. They are not real GTFS shapes. Some stop coordinates may also need verification.

The design must not imply survey-grade accuracy. Include a visual approach for sample or estimated route geometry, but keep the implementation plan separate:

- validate stop latitude and longitude against authoritative data;
- ingest actual route shapes where licensing and data availability permit;
- style estimated straight-line segments differently until real geometry exists;
- do not solve geographic errors by visually nudging markers away from their stored coordinates.

### 5. Responsive defects and QA risk

- How It Works overflows horizontally at phone width because a long inline code token cannot wrap.
- The large stylesheet contains old and new style layers, increasing the risk of regressions between map and secondary pages.
- The app is multi-page, so the shell must remain visually and behaviorally consistent after full page navigation.
- Capacitor safe areas, dynamic viewport height, fixed navigation, keyboard display, and scroll restoration all need explicit state testing.

## Existing Theme Explorations

Five generated visual explorations are available in [`../theme-concepts-2026-07-13/`](../theme-concepts-2026-07-13/):

1. [`01-coastal-glass.png`](../theme-concepts-2026-07-13/01-coastal-glass.png)
2. [`02-night-signal.png`](../theme-concepts-2026-07-13/02-night-signal.png)
3. [`03-sunline.png`](../theme-concepts-2026-07-13/03-sunline.png)
4. [`04-civic-standard.png`](../theme-concepts-2026-07-13/04-civic-standard.png)
5. [`05-tidal-future.png`](../theme-concepts-2026-07-13/05-tidal-future.png)

Treat these as inspiration, not approved designs. Select, reject, or combine their useful ideas based on the real screenshots and workflows. Avoid simply skinning the current layout.

## Technical Context

The app is intentionally lightweight:

- plain HTML, CSS, and JavaScript modules;
- Leaflet 1.9.4 with CARTO and OpenStreetMap tile layers;
- static JSON data with optional generated live snapshots;
- static GitHub Pages deployment;
- Capacitor 7 shell for iOS and Android;
- no frontend component framework and no runtime backend;
- local-only saved stops, saved routes, recent activity, and search history.

Important files:

- `index.html`: map, map menus, search, details rail, and navigation markup.
- `stops.html`, `routes.html`, `alerts.html`, `about.html`: secondary destinations.
- `how-it-works.html`, `data.html`: supporting information pages.
- `assets/css/styles.css`: all application styling, currently about 3,050 lines.
- `assets/js/app.js`: map page state and rendering, currently about 1,064 lines.
- `assets/js/ui/mapView.js`: Leaflet and SVG fallback map runtimes.
- `assets/js/bootstrap.js`: shared bottom navigation and viewport setup.
- `assets/js/stopsPage.js`, `routesPage.js`, `alertsPage.js`, `morePage.js`: secondary page behavior.
- `data/config.json`: runtime branding, regions, map modes, privacy, support, and data paths.
- `capacitor.config.ts`: native shell configuration; generated web assets go to `mobile/www`.

Local commands:

```bash
npm run serve
npm run validate:data
npm run cap:sync
```

The local server is available at `http://localhost:4173` while `npm run serve` is running.

## Functional Invariants

The overhaul must preserve or deliberately improve all of these behaviors:

- map pan, zoom, reset, and tile attribution;
- Leaflet map plus the SVG fallback when Leaflet is unavailable;
- region switching for Gold Coast, Brisbane, and Logan sample data;
- map modes: Color, Routes, and Links;
- transit mode filters;
- stop and route selection directly on the map;
- search results, keyboard search focus, and clear action;
- selected stop details, departures, alerts, map links, coordinate copy, saved stop, comparison, and direct trip estimates;
- route selection, route legend, route detail, stop sequence, saved route, and copied deep link;
- URL state for selected region, stop, route, and relevant page state;
- localStorage-only personalization;
- five-item phone bottom navigation with clear active state;
- safe-area padding in Capacitor and browser contexts;
- accessible names, visible focus, touch targets, reduced-motion support, and sufficient contrast;
- optional live-data status and honest sample/fallback messaging;
- no account requirement.

## Visual Direction Constraints

- The map remains the first-viewport signal and dominant surface.
- This is an operational transit product, not a marketing landing page. Avoid giant hero copy, decorative section cards, and ornamental composition.
- Use familiar icons for map tools and command buttons. Add tooltips or accessible names for unfamiliar icons.
- Use bottom sheets, popovers, segmented controls, toggles, and swatches where they fit the interaction better than dropdowns.
- Do not put cards inside cards. Use separators and typographic hierarchy inside detail surfaces.
- Keep individual card radii at 8 px or less unless there is a specific platform reason.
- Do not use decorative gradients, floating color orbs, bokeh, or generic glass everywhere. Transparency should communicate layering over the map, not become the entire visual identity.
- Avoid a one-note palette, especially all teal, purple, beige, dark blue, or orange. Route colors, status colors, map land/water, and neutral UI surfaces should work together.
- Never reduce map legibility to make overlays look dramatic. Preserve labels, route contrast, stop hit targets, and attribution.
- Make desktop an intentional workspace. It may use a rail, dock, or responsive sheet, but it should not be a stretched phone layout.
- Prefer a small number of strong surfaces over many floating boxes.
- The app icon is colorful and detailed. Specify where the full icon is appropriate and where a simpler monochrome brand mark or wordmark is needed at small sizes.

## Tip Jar Requirements

The More page already supports `$3`, `$7`, and `$15` options, sharing, and a configurable checkout URL. `data/config.json` currently has an empty `support.tipJarUrl`, so the checkout action is intentionally disabled.

The redesign should keep support optional and respectful:

- no interruption of map, search, departures, or alert workflows;
- no modal on startup and no repeated nagging;
- communicate that the app stays free;
- show what support helps fund in concise language;
- provide a useful disabled or unavailable state until a payment URL is configured;
- retain sharing as a non-monetary support option;
- specify payment-provider trust, external-link, and confirmation states without inventing a provider.

## Required Design Deliverable

Return one cohesive blueprint, not several vague alternatives. The deliverable should include:

1. **Audit summary:** rank the current visual and interaction problems by severity and user impact, citing screenshot filenames.
2. **Chosen direction:** name the design direction and explain which theme exploration ideas are used or rejected.
3. **Information architecture:** define the role of Map, Stops, Routes, Alerts, and More on phone and desktop.
4. **Responsive screen specifications:** describe layout, hierarchy, and behavior for every screenshot state above, including closed, open, loading, empty, selected, and error states.
5. **Map interaction model:** specify search, region, layers, filters, zoom, selected stop, selected route, and details behavior without covering too much of the map.
6. **Component and state inventory:** list reusable shell, navigation, toolbar, popover, sheet, list row, alert, route, stop, status, and support components with their variants.
7. **Design tokens:** provide implementable CSS variables for color roles, typography, spacing, radii, borders, shadows, opacity, blur, elevation, motion, and map overlay contrast.
8. **Accessibility specification:** include focus, touch target, contrast, text scaling, reduced motion, sheet semantics, keyboard flow, and screen-reader labels.
9. **Implementation handback:** map the design to the existing HTML/CSS/JS files and propose phased changes that preserve behavior. Identify what should be refactored versus restyled.
10. **Acceptance checklist:** include exact phone and desktop viewport checks, no overlap, no clipped text, no horizontal scrolling, safe-area handling, keyboard opening, and full navigation consistency.

Use concise wireframes or structured diagrams where helpful. Do not implement production code in this design pass. Do not create a landing page. The final section must be a clear build brief that Codex can execute in this repository.

## Definition of Success

The design is ready to hand back when a developer can answer all of these without guessing:

- What is visible in the first phone viewport, and what is intentionally hidden?
- What happens when each map control is opened, and can only one transient panel be open at once?
- How does a stop or route transition from map selection to detail?
- How does the same interaction adapt to desktop?
- Which navigation exists at each breakpoint?
- Which data states and errors are represented?
- Which exact token and component rules create the premium feel?
- How do supporting pages remain part of the same app?
- How is geographic uncertainty shown honestly?
- What files and phases should Codex change to build it safely?
