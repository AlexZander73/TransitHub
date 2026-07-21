import BackgroundTasks
import CoreLocation
import Foundation
import UIKit
import UserNotifications

enum BackgroundRefresh {
    static let identifier = "au.com.coastpulse.transithub.refresh"

    private static var canUseScheduler: Bool {
        guard ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil,
              let permittedIdentifiers = Bundle.main.object(
                forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers"
              ) as? [String]
        else { return false }
        return permittedIdentifiers.contains(identifier)
    }

    static func schedule() {
        guard canUseScheduler else { return }
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }
}

struct BackgroundRefreshWorker {
    private let baseURL = URL(string: "https://alexzander73.github.io/TransitHub/data/")!
    private let maxAge: TimeInterval = 20 * 60

    func run(now: Date = .now) async -> Bool {
        guard let snapshot = AppGroupStore.readSnapshot(), let stopID = snapshot.stopID else { return true }
        do {
            async let departureData = fetch("departures.live.json")
            async let vehicleData = fetch("vehicles.live.json")
            async let alertData = fetch("alerts.live.json")
            let (departuresRaw, vehiclesRaw, alertsRaw) = try await (departureData, vehicleData, alertData)
            let decoder = JSONDecoder()
            let departures = try decoder.decode(DeparturePayload.self, from: departuresRaw)
            let vehicles = try decoder.decode(VehiclePayload.self, from: vehiclesRaw)
            let alerts = try decoder.decode(AlertPayload.self, from: alertsRaw)
            let isFresh = departures.meta?.generatedDate.map { now.timeIntervalSince($0) <= maxAge } ?? false

            let live = departures.stops[stopID, default: []]
                .compactMap { item -> WidgetDeparture? in
                    guard let date = item.departureDate, date > now.addingTimeInterval(-60) else { return nil }
                    return .init(
                        id: item.id,
                        routeID: item.routeId,
                        headsign: item.headsign,
                        departure: date,
                        isLive: isFresh,
                        status: item.status,
                        delayMinutes: item.delayMinutes,
                        platform: item.platform
                    )
                }
                .sorted { $0.departure < $1.departure }
                .prefix(4)
            let routes = Set(AppGroupStore.defaults.stringArray(forKey: AppGroupStore.Key.notificationRoutes) ?? [])
            let relevantAlerts = alerts.alerts.filter { alert in
                alert.isActive(at: now) && (alert.stops.contains(stopID) || alert.routes.contains(where: routes.contains))
            }
            let dataState: LiveDataState = isFresh ? .live : .stale
            AppGroupStore.write(
                snapshot: WidgetTransitSnapshot(
                    stopID: snapshot.stopID,
                    stopName: snapshot.stopName,
                    stopCode: snapshot.stopCode,
                    updatedAt: now,
                    departures: live.isEmpty || !isFresh ? snapshot.departures : Array(live),
                    activeAlertCount: relevantAlerts.count,
                    serviceMessage: serviceMessage(live: Array(live), isFresh: isFresh),
                    dataState: dataState
                )
            )

            let watches = readWatches()
            let watchedStops = Set(watches.map(\.stopID))
            let arrivalsByStop = Dictionary(uniqueKeysWithValues: watchedStops.map { watchedStopID in
                let arrivals = departures.stops[watchedStopID, default: []].compactMap { item -> Arrival? in
                    guard let date = item.departureDate, date > now.addingTimeInterval(-60) else { return nil }
                    return Arrival(
                        id: item.id,
                        routeId: item.routeId,
                        headsign: item.headsign,
                        departure: date,
                        scheduledDeparture: item.scheduledTime.flatMap(FlexibleDate.parse),
                        platform: item.platform,
                        status: item.status,
                        delayMinutes: item.delayMinutes,
                        source: .live
                    )
                }
                return (watchedStopID, arrivals)
            })
            let events = CommuteAlertEngine.events(
                watches: watches,
                arrivalsByStop: arrivalsByStop,
                incidents: departures.incidents ?? [],
                alerts: alerts.alerts,
                vehicleHealth: inferVehicleHealth(vehicles.vehicles, now: now),
                now: now
            )
            await postNewCommuteEvents(events, now: now)
            if watches.isEmpty { await notifyAboutNewAlerts(relevantAlerts) }
            return true
        } catch {
            return false
        }
    }

    private func serviceMessage(live: [WidgetDeparture], isFresh: Bool) -> String {
        guard isFresh else { return "Live feed delayed - saved timetable shown" }
        if let disrupted = live.first(where: {
            ServiceCondition(status: $0.status, delayMinutes: $0.delayMinutes).isDisrupted
        }) {
            let condition = ServiceCondition(status: disrupted.status, delayMinutes: disrupted.delayMinutes)
            if condition == .cancelled { return "Next service cancelled" }
            if condition == .skipped { return "Next service not stopping" }
            if disrupted.delayMinutes > 0 { return "Next service \(disrupted.delayMinutes) min late" }
        }
        return live.isEmpty ? "No live departures" : "Live arrivals"
    }

    private func fetch(_ file: String) async throws -> Data {
        var request = URLRequest(
            url: baseURL.appendingPathComponent(file),
            cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
            timeoutInterval: 10
        )
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return data
    }

    private func readWatches() -> [CommuteWatch] {
        guard let data = AppGroupStore.defaults.data(forKey: AppGroupStore.Key.commuteWatches) else { return [] }
        return (try? JSONDecoder().decode([CommuteWatch].self, from: data)) ?? []
    }

    private func inferVehicleHealth(_ vehicles: [TransitVehicle], now: Date) -> [VehicleServiceHealth] {
        guard let data = AppGroupStore.defaults.data(forKey: AppGroupStore.Key.vehicleObservations),
              let prior = try? JSONDecoder().decode([String: VehicleObservation].self, from: data)
        else { return [] }
        return vehicles.compactMap { vehicle in
            guard let old = prior[vehicle.id] else { return nil }
            let elapsed = now.timeIntervalSince(old.observedAt)
            let oldLocation = CLLocation(latitude: old.latitude, longitude: old.longitude)
            let newLocation = CLLocation(latitude: vehicle.lat, longitude: vehicle.lon)
            guard elapsed >= 12 * 60, elapsed <= 45 * 60,
                  oldLocation.distance(from: newLocation) < 75,
                  (vehicle.speed ?? 0) < 1.5 else { return nil }
            return VehicleServiceHealth(
                vehicleID: vehicle.id,
                routeID: vehicle.routeId,
                tripID: vehicle.tripId,
                condition: .stalled,
                stationaryMinutes: Int(elapsed / 60),
                observedAt: now
            )
        }
    }

    private func postNewCommuteEvents(_ events: [CommuteEvent], now: Date) async {
        guard AppGroupStore.defaults.bool(forKey: AppGroupStore.Key.notificationsEnabled) else { return }
        var history: [String: Double] = [:]
        if let data = AppGroupStore.defaults.data(forKey: AppGroupStore.Key.commuteEventHistory) {
            history = (try? JSONDecoder().decode([String: Double].self, from: data)) ?? [:]
        }
        history = history.filter { now.timeIntervalSince1970 - $0.value < 24 * 60 * 60 }
        for event in events where history[event.id] == nil {
            let content = UNMutableNotificationContent()
            content.title = event.title
            content.body = event.body
            content.sound = .default
            content.categoryIdentifier = CommuteNotificationService.categoryID
            content.userInfo = [
                "url": "coastpulse://stop/\(event.stopID)",
                "stopID": event.stopID,
                "watchID": event.watchID.uuidString
            ]
            try? await UNUserNotificationCenter.current().add(
                UNNotificationRequest(identifier: "commute-\(event.id)", content: content, trigger: nil)
            )
            history[event.id] = now.timeIntervalSince1970
        }
        if let data = try? JSONEncoder().encode(history) {
            AppGroupStore.defaults.set(data, forKey: AppGroupStore.Key.commuteEventHistory)
        }
    }

    private func notifyAboutNewAlerts(_ alerts: [TransitAlert]) async {
        guard AppGroupStore.defaults.bool(forKey: AppGroupStore.Key.notificationsEnabled) else { return }
        let seen = Set(AppGroupStore.defaults.stringArray(forKey: AppGroupStore.Key.seenAlertIDs) ?? [])
        guard let alert = alerts.first(where: { !seen.contains($0.id) }) else { return }
        let content = UNMutableNotificationContent()
        content.title = alert.title
        content.body = alert.readableDescription
        content.sound = .default
        content.userInfo = ["url": "coastpulse://alerts"]
        try? await UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: "alert-\(alert.id)", content: content, trigger: nil)
        )
        AppGroupStore.defaults.set(Array(seen.union(alerts.map(\.id))), forKey: AppGroupStore.Key.seenAlertIDs)
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        BackgroundRefresh.schedule()
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        AppGroupStore.defaults.set(token, forKey: AppGroupStore.Key.deviceToken)
        Task { await PushRegistrationService.upload(token: token) }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        if response.actionIdentifier == CommuteNotificationService.pauseActionID,
           let value = info["watchID"] as? String,
           let id = UUID(uuidString: value) {
            pauseWatch(id)
            return
        }
        guard let value = info["url"] as? String, let url = URL(string: value) else { return }
        await MainActor.run { UIApplication.shared.open(url) }
    }

    private func pauseWatch(_ id: UUID) {
        guard let data = AppGroupStore.defaults.data(forKey: AppGroupStore.Key.commuteWatches),
              var watches = try? JSONDecoder().decode([CommuteWatch].self, from: data),
              let index = watches.firstIndex(where: { $0.id == id }) else { return }
        watches[index].enabled = false
        if let updated = try? JSONEncoder().encode(watches) {
            AppGroupStore.defaults.set(updated, forKey: AppGroupStore.Key.commuteWatches)
        }
    }
}
