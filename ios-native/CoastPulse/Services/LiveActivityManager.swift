import ActivityKit
import Foundation

@MainActor
final class LiveActivityManager: ObservableObject {
    @Published private(set) var activeStopID: String?
    @Published var statusMessage: String?

    init() {
        activeStopID = Activity<TransitActivityAttributes>.activities.first?.attributes.stopID
    }

    func start(stop: TransitStop, arrival: Arrival, routeDisplayName: String? = nil) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            statusMessage = "Live Activities are disabled for CoastPulse."
            return
        }
        await endAll()
        let attributes = TransitActivityAttributes(stopID: stop.id, stopName: stop.name)
        let state = contentState(from: arrival, routeDisplayName: routeDisplayName)
        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: arrival.departure.addingTimeInterval(5 * 60)),
                pushType: .token
            )
            activeStopID = stop.id
            statusMessage = "Live Activity started."
            observePushToken(for: activity)
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func update(stopID: String, arrival: Arrival?, routeDisplayName: String? = nil) async {
        guard let arrival else { return }
        for activity in Activity<TransitActivityAttributes>.activities where activity.attributes.stopID == stopID {
            await activity.update(
                ActivityContent(
                    state: contentState(from: arrival, routeDisplayName: routeDisplayName),
                    staleDate: arrival.departure.addingTimeInterval(5 * 60)
                )
            )
        }
    }

    func endAll() async {
        for activity in Activity<TransitActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        activeStopID = nil
    }

    private func contentState(from arrival: Arrival, routeDisplayName: String?) -> TransitActivityAttributes.ContentState {
        .init(
            routeID: routeDisplayName ?? arrival.routeId,
            headsign: arrival.headsign,
            departure: arrival.departure,
            scheduledDeparture: arrival.scheduledDeparture,
            status: arrival.status,
            delayMinutes: arrival.delayMinutes,
            platform: arrival.platform,
            isLive: arrival.source == .live
        )
    }

    private func observePushToken(for activity: Activity<TransitActivityAttributes>) {
        Task {
            for await token in activity.pushTokenUpdates {
                AppGroupStore.defaults.set(token.map { String(format: "%02x", $0) }.joined(), forKey: "liveActivityPushToken")
            }
        }
    }
}
