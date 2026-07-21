import CoreLocation
import Foundation
import UIKit
import UserNotifications

@MainActor
final class CommuteNotificationService: ObservableObject {
    nonisolated static let categoryID = "COMMUTE_EVENT"
    nonisolated static let viewActionID = "VIEW_STOP"
    nonisolated static let pauseActionID = "PAUSE_WATCH"

    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined

    func configure() async {
        let view = UNNotificationAction(identifier: Self.viewActionID, title: "View stop")
        let pause = UNNotificationAction(identifier: Self.pauseActionID, title: "Pause watch")
        let category = UNNotificationCategory(
            identifier: Self.categoryID,
            actions: [view, pause],
            intentIdentifiers: [],
            options: []
        )
        let center = UNUserNotificationCenter.current()
        center.setNotificationCategories([category])
        authorizationStatus = await center.notificationSettings().authorizationStatus
    }

    func requestAuthorization() async -> Bool {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .badge, .sound]
        )) ?? false
        authorizationStatus = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if granted { UIApplication.shared.registerForRemoteNotifications() }
        return granted
    }

    func evaluate(
        watches: [CommuteWatch],
        repository: TransitRepository,
        userLocation: CLLocation?
    ) async {
        guard !watches.isEmpty,
              AppGroupStore.defaults.bool(forKey: AppGroupStore.Key.notificationsEnabled)
        else { return }

        let arrivals = Dictionary(uniqueKeysWithValues: Set(watches.map(\.stopID)).map {
            ($0, repository.arrivals(for: $0, limit: 12))
        })
        let events = CommuteAlertEngine.events(
            watches: watches,
            arrivalsByStop: arrivals,
            incidents: repository.serviceIncidents,
            alerts: repository.alerts,
            vehicleHealth: repository.vehicleHealth
        )
        await postNew(events)
        await scheduleDepartureReminders(
            watches: watches,
            arrivalsByStop: arrivals,
            stopByID: repository.stopByID,
            userLocation: userLocation
        )
    }

    private func postNew(_ events: [CommuteEvent], now: Date = .now) async {
        var history = readHistory().filter { now.timeIntervalSince1970 - $0.value < 24 * 60 * 60 }
        for event in events where history[event.id] == nil {
            let content = content(
                title: event.title,
                body: event.body,
                stopID: event.stopID,
                watchID: event.watchID
            )
            try? await UNUserNotificationCenter.current().add(
                UNNotificationRequest(identifier: "commute-\(event.id)", content: content, trigger: nil)
            )
            history[event.id] = now.timeIntervalSince1970
        }
        writeHistory(history)
    }

    private func scheduleDepartureReminders(
        watches: [CommuteWatch],
        arrivalsByStop: [String: [Arrival]],
        stopByID: [String: TransitStop],
        userLocation: CLLocation?,
        now: Date = .now
    ) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix("departure-") })

        for watch in watches where watch.enabled {
            guard let stop = stopByID[watch.stopID] else { continue }
            let walkingMinutes: Int
            if let userLocation {
                walkingMinutes = Int(ceil(userLocation.distance(from: CLLocation(latitude: stop.lat, longitude: stop.lon)) / 78.0))
            } else {
                walkingMinutes = 0
            }
            for arrival in arrivalsByStop[watch.stopID, default: []]
                .filter({ $0.isBoardable && watch.matches(routeID: $0.routeId, headsign: $0.headsign) })
                .prefix(3) {
                guard watch.isActive(at: arrival.departure),
                      arrival.condition != .severelyDelayed else { continue }
                let fireDate = arrival.departure.addingTimeInterval(
                    TimeInterval(-(watch.departureLeadMinutes + walkingMinutes) * 60)
                )
                guard fireDate > now.addingTimeInterval(30), fireDate < now.addingTimeInterval(4 * 60 * 60) else { continue }
                let body = walkingMinutes > 0
                    ? "Leave in time for a \(walkingMinutes)-minute walk. Route \(arrival.routeId) departs at \(arrival.departure.shortTransitTime)."
                    : "Route \(arrival.routeId) to \(arrival.headsign) departs at \(arrival.departure.shortTransitTime)."
                let request = UNNotificationRequest(
                    identifier: "departure-\(watch.id)-\(arrival.id)",
                    content: content(
                        title: "Time to leave for \(watch.name)",
                        body: body,
                        stopID: watch.stopID,
                        watchID: watch.id
                    ),
                    trigger: UNTimeIntervalNotificationTrigger(timeInterval: fireDate.timeIntervalSince(now), repeats: false)
                )
                try? await center.add(request)
            }
        }
    }

    private func content(title: String, body: String, stopID: String, watchID: UUID) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.categoryIdentifier = Self.categoryID
        content.userInfo = [
            "url": "coastpulse://stop/\(stopID)",
            "stopID": stopID,
            "watchID": watchID.uuidString
        ]
        return content
    }

    private func readHistory() -> [String: Double] {
        guard let data = AppGroupStore.defaults.data(forKey: AppGroupStore.Key.commuteEventHistory) else { return [:] }
        return (try? JSONDecoder().decode([String: Double].self, from: data)) ?? [:]
    }

    private func writeHistory(_ history: [String: Double]) {
        guard let data = try? JSONEncoder().encode(history) else { return }
        AppGroupStore.defaults.set(data, forKey: AppGroupStore.Key.commuteEventHistory)
    }
}

enum PushRegistrationService {
    static func upload(token: String) async {
        guard let endpoint = Bundle.main.object(forInfoDictionaryKey: "PushRegistrationURL") as? String,
              !endpoint.isEmpty,
              let url = URL(string: endpoint) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "token": token,
            "platform": "ios",
            "bundleID": Bundle.main.bundleIdentifier ?? ""
        ])
        _ = try? await URLSession.shared.data(for: request)
    }
}
