# Design Notes

## Design direction

CoastPulse Transit Atlas uses a calm, map-centric interface with restrained visual accents and strong information hierarchy.

Principles:

- map is primary surface
- controls are compact and obvious
- status and fallback state are explicit
- cards and panels are readable on mobile and desktop
- movement and highlighting are subtle, not decorative

## Visual system

- Soft light backgrounds and glass-like header treatment
- Color-coded route lines and mode badges
- Rounded cards with low-elevation shadows
- Dense but legible typography with compact metadata rows

## Interaction notes

- keyboard shortcut `/` focuses search
- keyboard shortcut `Cmd/Ctrl + K` focuses search
- map supports pan and zoom with pointer + wheel
- selected/compare/favorite stops have distinct marker states
- mobile uses expandable detail sheet behavior

## Information hierarchy

Map page panel order:

1. region status
2. route legend
3. selected stop intelligence
4. departures and alerts
5. direct estimate and compare tools

## Intentional constraints

- no heavy charting layers in MVP
- no dense map labels for every stop at once
- no route spaghetti overlays by default in corridor mode
- no fake journey-planner visuals for unsupported features
