import Foundation

struct CommuteWatch: Codable, Identifiable, Hashable {
    let id: UUID
    var name: String
    var stopID: String
    var routeIDs: [String]
    var headsign: String?
    var weekdays: [Int]
    var startMinute: Int
    var endMinute: Int
    var delayThreshold: Int
    var departureLeadMinutes: Int
    var notifyDelay: Bool
    var notifyCancellation: Bool
    var notifySkippedStop: Bool
    var notifyServiceAlerts: Bool
    var notifyStalledVehicle: Bool
    var enabled: Bool

    init(
        id: UUID = UUID(),
        name: String = "My commute",
        stopID: String,
        routeIDs: [String] = [],
        headsign: String? = nil,
        weekdays: [Int] = [2, 3, 4, 5, 6],
        startMinute: Int = 7 * 60,
        endMinute: Int = 9 * 60,
        delayThreshold: Int = 5,
        departureLeadMinutes: Int = 10,
        notifyDelay: Bool = true,
        notifyCancellation: Bool = true,
        notifySkippedStop: Bool = true,
        notifyServiceAlerts: Bool = true,
        notifyStalledVehicle: Bool = true,
        enabled: Bool = true
    ) {
        self.id = id
        self.name = name
        self.stopID = stopID
        self.routeIDs = routeIDs
        self.headsign = headsign
        self.weekdays = weekdays
        self.startMinute = startMinute
        self.endMinute = endMinute
        self.delayThreshold = delayThreshold
        self.departureLeadMinutes = departureLeadMinutes
        self.notifyDelay = notifyDelay
        self.notifyCancellation = notifyCancellation
        self.notifySkippedStop = notifySkippedStop
        self.notifyServiceAlerts = notifyServiceAlerts
        self.notifyStalledVehicle = notifyStalledVehicle
        self.enabled = enabled
    }

    func isActive(at date: Date = .now, calendar: Calendar = .brisbane) -> Bool {
        guard enabled else { return false }
        let weekday = calendar.component(.weekday, from: date)
        let minute = calendar.component(.hour, from: date) * 60 + calendar.component(.minute, from: date)
        if startMinute <= endMinute {
            return weekdays.contains(weekday) && minute >= startMinute && minute <= endMinute
        }
        if minute >= startMinute { return weekdays.contains(weekday) }
        guard let previous = calendar.date(byAdding: .day, value: -1, to: date) else { return false }
        return minute <= endMinute && weekdays.contains(calendar.component(.weekday, from: previous))
    }

    func matches(routeID: String, headsign candidateHeadsign: String) -> Bool {
        let routeMatches = routeIDs.isEmpty || routeIDs.contains(routeID)
        let directionMatches = headsign?.isEmpty != false
            || candidateHeadsign.localizedCaseInsensitiveContains(headsign ?? "")
        return routeMatches && directionMatches
    }
}

enum CommuteEventKind: String, Codable, Hashable {
    case departureReminder
    case delayed
    case cancelled
    case skipped
    case serviceAlert
    case stalled
    case recovered
}

struct CommuteEvent: Identifiable, Hashable {
    let watchID: UUID
    let kind: CommuteEventKind
    let title: String
    let body: String
    let stopID: String
    let routeID: String?
    let tripID: String?
    let eventDate: Date

    var id: String {
        "\(watchID.uuidString)|\(kind.rawValue)|\(routeID ?? "-")|\(tripID ?? "-")|\(stopID)"
    }
}

extension Calendar {
    static var brisbane: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Australia/Brisbane") ?? .current
        return calendar
    }
}
