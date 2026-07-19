# CoastPulse native iOS QA

Captured from the SwiftUI app on iPhone 17 Pro and iPhone 17 Pro Max simulators running iOS 26.5.

## Reviewed screens

- `coastpulse-native-default-final.png`: default full-screen network map.
- `coastpulse-native-stops-clean.png`: searchable stop directory and persistent tab bar.
- `coastpulse-native-alerts-corrected.png`: region-relevant service alert presentation.
- `coastpulse-native-settings.png`: premium themes, alternate icons, notifications, and tip jar.
- `coastpulse-native-stop-sheet.png`: stop timetable, favourite action, and Live Activity action.
- `coastpulse-native-midnight-map.png`: Midnight Signal dark map.
- `coastpulse-native-aurora-map.png`: Aurora dark purple/cyan map.
- `coastpulse-native-transit-motion-map.png`: Transit Motion light red/blue map.
- `coastpulse-native-coastline-final.png`: Coastline Explorer hybrid satellite map.
- `coastpulse-live-activity-final.png`: real compact Dynamic Island Live Activity.

## Findings addressed

- Moved map search below the status bar and Dynamic Island.
- Removed duplicate background-task registration that caused launch crashes.
- Reduced alert flooding to active, region-relevant notices and repaired missing sentence spacing from feed extraction.
- Kept the stop sheet focused on next arrivals and preserved the underlying map camera when dismissed.
- Made Coastline Explorer materially distinct with hybrid cartography.
- Replaced internal route identifiers in widgets and Live Activities with passenger-facing route names.
- Added privacy manifests, explicit orientation metadata, background-task metadata, App Group entitlements, and extension embedding.

## Verification

- Swift unit tests pass on iOS 26.5 simulator.
- Unsigned arm64 Release build passes for generic iOS device.
- App and WidgetKit extension plists and privacy manifests pass `plutil -lint`.
- Widget extension is embedded in the Release app bundle.
- Dynamic Island Live Activity was started and rendered on the simulator.
- Shared transit data validation passes for 6 regions, 48 stops, 15 routes, 15 lines, and 19 interchanges.
