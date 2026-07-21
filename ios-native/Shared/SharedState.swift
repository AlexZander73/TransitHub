import Foundation

enum AppGroupStore {
    static let suiteName = "group.au.com.coastpulse.transithub"
    static let defaults = UserDefaults(suiteName: suiteName) ?? .standard

    enum Key {
        static let widgetSnapshot = "widgetSnapshot"
        static let favoriteStopIDs = "favoriteStopIDs"
        static let notificationRoutes = "notificationRoutes"
        static let notificationsEnabled = "notificationsEnabled"
        static let seenAlertIDs = "seenAlertIDs"
        static let deviceToken = "deviceToken"
        static let commuteWatches = "commuteWatches"
        static let commuteEventHistory = "commuteEventHistory"
        static let vehicleObservations = "vehicleObservations"
    }

    static func write(snapshot: WidgetTransitSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: Key.widgetSnapshot)
    }

    static func readSnapshot() -> WidgetTransitSnapshot? {
        guard let data = defaults.data(forKey: Key.widgetSnapshot) else { return nil }
        return try? JSONDecoder().decode(WidgetTransitSnapshot.self, from: data)
    }
}

struct WidgetTransitSnapshot: Codable, Hashable {
    let stopID: String?
    let stopName: String
    let stopCode: String?
    let updatedAt: Date
    let departures: [WidgetDeparture]
    let activeAlertCount: Int
    let serviceMessage: String
    let dataState: LiveDataState

    static let placeholder = WidgetTransitSnapshot(
        stopID: nil,
        stopName: "Choose a favourite stop",
        stopCode: nil,
        updatedAt: .now,
        departures: [],
        activeAlertCount: 0,
        serviceMessage: "Open CoastPulse to choose a stop",
        dataState: .unavailable
    )
}

struct WidgetDeparture: Codable, Identifiable, Hashable {
    let id: String
    let routeID: String
    let headsign: String
    let departure: Date
    let isLive: Bool
    let status: String
    let delayMinutes: Int
    let platform: String?

    var minutesAway: Int { max(0, Int((departure.timeIntervalSinceNow / 60).rounded(.down))) }
}
