# CoastPulse Native iOS

The native client lives beside the existing web and Capacitor applications. It consumes the same generated `../data` contract and does not replace the website source.

## Included

- Full-screen MapKit network map with route shapes, stop selection, live vehicles, region switching, and user-location nearest-stop lookup.
- Native Commute, Stops, Alerts, Settings, focused stop timetable, favourites, and persistent phone tab navigation.
- Commute Watch rules for stops, routes, directions, weekdays, overnight windows, delay thresholds, and time-to-leave reminders.
- Explicit early, delayed, severely delayed, cancelled, skipped-stop, replacement, stale-feed, and unavailable states.
- Vehicle-stall inference across 15-minute observations plus next-best route and nearby-stop suggestions.
- StoreKit 2 premium appearance purchase, four premium themes, three alternate app icons, restore purchases, and three tip-jar products.
- Home Screen and Lock Screen widgets for next departures and service status.
- ActivityKit Lock Screen and Dynamic Island Live Activity for a tracked departure.
- App Intents, deep links, deduplicated commute notifications, actionable pause/view controls, remote-notification registration, and 15-minute background refresh requests.
- Offline bundled data with remote GTFS-RT-derived snapshot refresh and cache fallback.

## Generate and build

```sh
cd ios-native
xcodegen generate
xcodebuild -project CoastPulse.xcodeproj -scheme CoastPulse -sdk iphonesimulator build CODE_SIGNING_ALLOWED=NO
```

Open `CoastPulse.xcodeproj` in Xcode to run the app, widget previews, StoreKit configuration, or an archive. Run `xcodegen generate` after changing `project.yml`.

## Verify

```sh
xcodebuild -project CoastPulse.xcodeproj -scheme CoastPulse \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test

xcodebuild -project CoastPulse.xcodeproj -scheme CoastPulse \
  -configuration Release -destination 'generic/platform=iOS' \
  build CODE_SIGNING_ALLOWED=NO
```

Simulator QA launch arguments are available for repeatable screenshots:

- `-CoastPulseTab map|commute|stops|alerts|settings`
- `-CoastPulseStop GCUH`
- `-CoastPulseStartLiveActivity` together with `-CoastPulseStop`
- `-CoastPulseSeedCommute` in Debug builds

## Release configuration

- Create the four product identifiers from `CoastPulse/CoastPulse.storekit` in App Store Connect.
- Replace the empty development team in `project.yml` with the Apple Developer team used by the existing app.
- Create the App Group `group.au.com.coastpulse.transithub` and enable Push Notifications, Background Modes, and Live Activities for the app identifier.
- Configure an APNs provider if Live Activities and disruption notifications must continue updating after iOS suspends the app.
- Set `PushRegistrationURL` in `project.yml` to the provider's HTTPS device-registration endpoint. The client posts the APNs token, platform, and bundle identifier when configured.
- Run `xcodegen generate` whenever `project.yml` changes.

The checked-in StoreKit configuration provides local purchase and tip-jar testing in Xcode without App Store Connect.

The production app still needs Apple Developer signing and an APNs provider before remote notifications or remote Live Activity updates can work after suspension. Foreground refresh, local notification scheduling, widgets, and locally started Live Activities are implemented in the client.

## Live-data operations

The GitHub Actions refresh uses Translink's official no-authentication GTFS-RT endpoints every 15 minutes and publishes departures, scheduled-vs-expected times, vehicles, trip incidents, alerts, and `data/live-status.json`. The app refuses to label a payload live after 20 minutes.

```sh
npm run refresh:live:gtfsrt
npm run test:live
npm run validate:live:freshness
```

GitHub Actions schedules are best effort. If a run is delayed, CoastPulse visibly falls back to timetable mode rather than presenting old predictions as live.
