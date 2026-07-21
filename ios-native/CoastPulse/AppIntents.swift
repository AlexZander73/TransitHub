import AppIntents
import Foundation

struct OpenTransitMapIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Transit Map"
    static let description = IntentDescription("Opens CoastPulse on the live transit map.")
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult { .result() }
}

struct OpenFavouriteStopIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Favourite Stop"
    static let description = IntentDescription("Opens CoastPulse to your saved transit information.")
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult { .result() }
}

struct OpenCommuteWatchIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Commute Watch"
    static let description = IntentDescription("Opens your current commute and disruption status.")
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult { .result() }
}

struct CoastPulseShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenTransitMapIntent(),
            phrases: ["Open the map in \(.applicationName)", "Show nearby transport in \(.applicationName)"],
            shortTitle: "Transit map",
            systemImageName: "map.fill"
        )
        AppShortcut(
            intent: OpenCommuteWatchIntent(),
            phrases: ["Check my commute in \(.applicationName)", "Is my commute on time in \(.applicationName)"],
            shortTitle: "Check commute",
            systemImageName: "clock.badge.checkmark.fill"
        )
        AppShortcut(
            intent: OpenFavouriteStopIntent(),
            phrases: ["Show my favourite stop in \(.applicationName)"],
            shortTitle: "Favourite stop",
            systemImageName: "star.fill"
        )
    }
}
