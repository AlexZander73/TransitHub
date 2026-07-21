import ActivityKit
import Foundation

struct TransitActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let routeID: String
        let headsign: String
        let departure: Date
        let scheduledDeparture: Date?
        let status: String
        let delayMinutes: Int
        let platform: String?
        let isLive: Bool
    }

    let stopID: String
    let stopName: String
}
