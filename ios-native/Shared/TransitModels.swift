import CoreLocation
import Foundation

struct DatasetMeta: Codable, Hashable {
    var generatedAt: String?
    var source: String?
    var version: String?

    var generatedDate: Date? { generatedAt.flatMap(FlexibleDate.parse) }
}

struct RegionPayload: Codable { let regions: [TransitRegion] }
struct StopPayload: Codable { let stops: [TransitStop] }
struct RoutePayload: Codable { let routes: [TransitRoute] }
struct AlertPayload: Codable { let meta: DatasetMeta?; let alerts: [TransitAlert] }
struct VehiclePayload: Codable { let meta: DatasetMeta?; let vehicles: [TransitVehicle] }
struct DeparturePayload: Codable {
    let meta: DatasetMeta?
    let stops: [String: [TransitDeparture]]
    let incidents: [ServiceIncident]?
}
struct RouteShapePayload: Codable { let meta: DatasetMeta?; let routes: [String: RouteShapeGroup] }

struct TransitRegion: Codable, Identifiable, Hashable {
    let id: String
    let label: String
    let shortLabel: String
    let status: String
    let description: String
}

struct TransitStop: Codable, Identifiable, Hashable {
    let id: String
    let region: String
    let name: String
    let code: String
    let type: String
    let modes: [String]
    let lat: Double
    let lon: Double
    let routes: [String]
    let importance: String
    let suburb: String
    let interchangeId: String?
    let nearbyStopIds: [String]?
    let gtfsStopIds: [String]?

    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lon) }
    var isMajor: Bool { importance == "major" || modes.contains("interchange") }
}

struct TransitRoute: Codable, Identifiable, Hashable {
    let id: String
    let region: String
    let lineId: String
    let family: String
    let shortName: String
    let longName: String
    let mode: String
    let color: String
    let textColor: String
    let stopSequence: [String]
    let segmentMinutes: [Int]
    let serviceSpan: [String: ServiceProfile]
    let directions: [RouteDirection]
    let status: String
}

struct ServiceProfile: Codable, Hashable {
    let first: String
    let last: String
    let frequencyMins: Int
}

struct RouteDirection: Codable, Identifiable, Hashable {
    let id: String
    let headsign: String
    let originStopId: String
    let destinationStopId: String
    let service: [String: ServiceProfile]
}

struct RouteShapeGroup: Codable, Hashable {
    let sourceRouteId: String
    let shapes: [RouteShape]
}

struct RouteShape: Codable, Hashable {
    let directionId: String
    let headsign: String
    let sourceShapeId: String
    let points: [[Double]]

    var coordinates: [CLLocationCoordinate2D] {
        points.compactMap { pair in
            guard pair.count >= 2 else { return nil }
            return CLLocationCoordinate2D(latitude: pair[0], longitude: pair[1])
        }
    }
}

struct TransitDeparture: Codable, Identifiable, Hashable {
    let tripId: String
    let routeId: String
    let headsign: String
    let expectedTime: String?
    let scheduledTime: String?
    let epochSeconds: Double?
    let inMinutes: Int?
    let platform: String?
    let status: String
    let delayMinutes: Int

    var id: String { "\(tripId)-\(routeId)" }
    var departureDate: Date? {
        expectedTime.flatMap(FlexibleDate.parse)
            ?? scheduledTime.flatMap(FlexibleDate.parse)
            ?? epochSeconds.map { Date(timeIntervalSince1970: $0) }
    }
}

struct ServiceIncident: Codable, Identifiable, Hashable {
    let id: String
    let tripId: String?
    let routeId: String
    let headsign: String
    let status: String
    let stopIds: [String]
    let expectedTime: String?
    let detail: String?

    var expectedDate: Date? { expectedTime.flatMap(FlexibleDate.parse) }
    var condition: ServiceCondition { ServiceCondition(status: status, delayMinutes: 0) }
}

struct TransitVehicle: Codable, Identifiable, Hashable {
    let id: String
    let label: String
    let routeId: String
    let mode: String
    let tripId: String?
    let headsign: String?
    let stopId: String?
    let lat: Double
    let lon: Double
    let bearing: Double?
    let speed: Double?
    let status: String
    let timestamp: Double?
    let updatedAt: String?

    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lon) }
    var updatedDate: Date? { updatedAt.flatMap(FlexibleDate.parse) }
}

struct TransitAlert: Codable, Identifiable, Hashable {
    let id: String
    let region: String?
    let level: String
    let severity: Int
    let title: String
    let description: String
    let routes: [String]
    let stops: [String]
    let interchanges: [String]
    let effectiveFrom: String?
    let effectiveTo: String?
    let status: String
    let impact: String?

    var readableDescription: String {
        description
            .replacingOccurrences(of: #"(?<=[.!?:;])(?=[A-Z])"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"(?<=[a-z])(?=[A-Z]\d)"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func isActive(at date: Date = .now) -> Bool {
        guard status.lowercased() != "inactive", impact?.uppercased() != "NO EFFECT" else { return false }
        if let from = effectiveFrom.flatMap(FlexibleDate.parse), date < from { return false }
        if let to = effectiveTo.flatMap(FlexibleDate.parse), date > to { return false }
        return true
    }
}

struct Arrival: Identifiable, Hashable {
    let id: String
    let routeId: String
    let headsign: String
    let departure: Date
    let scheduledDeparture: Date?
    let platform: String?
    let status: String
    let delayMinutes: Int
    let source: ArrivalSource

    var minutesAway: Int { max(0, Int((departure.timeIntervalSinceNow / 60).rounded(.down))) }
    var condition: ServiceCondition { ServiceCondition(status: status, delayMinutes: delayMinutes) }
    var isBoardable: Bool { ![.cancelled, .skipped, .endingEarly].contains(condition) }

    var statusText: String {
        switch condition {
        case .onTime: return source == .live ? "On time" : "Timetable"
        case .early: return delayMinutes < 0 ? "\(abs(delayMinutes)) min early" : "Early"
        case .delayed, .severelyDelayed: return "\(max(1, delayMinutes)) min late"
        case .cancelled: return "Cancelled"
        case .skipped: return "Not stopping"
        case .noData: return "Live data unavailable"
        case .trackingUnavailable: return "Vehicle tracking unavailable"
        case .stalled: return "Vehicle has not moved"
        case .replaced: return "Replacement service"
        case .endingEarly: return "Ending early"
        }
    }
}

enum ArrivalSource: String, Codable, Hashable { case live, scheduled }

enum ServiceCondition: String, Codable, CaseIterable, Hashable {
    case onTime = "on_time"
    case early
    case delayed = "minor_delay"
    case severelyDelayed = "severe_delay"
    case cancelled
    case skipped
    case noData = "no_data"
    case trackingUnavailable = "tracking_unavailable"
    case stalled
    case replaced
    case endingEarly = "ending_early"

    init(status: String, delayMinutes: Int) {
        let normalized = status.lowercased().replacingOccurrences(of: "-", with: "_")
        switch normalized {
        case "cancelled", "canceled": self = .cancelled
        case "skipped", "not_stopping": self = .skipped
        case "no_data", "unknown": self = .noData
        case "tracking_unavailable": self = .trackingUnavailable
        case "stalled", "stopped": self = .stalled
        case "replaced", "replacement": self = .replaced
        case "ending_early", "short_turned": self = .endingEarly
        case "severe_delay", "significant_delay": self = .severelyDelayed
        case "minor_delay", "delayed": self = delayMinutes >= 10 ? .severelyDelayed : .delayed
        case "early": self = .early
        default:
            if delayMinutes >= 10 { self = .severelyDelayed }
            else if delayMinutes >= 2 { self = .delayed }
            else if delayMinutes <= -2 { self = .early }
            else { self = .onTime }
        }
    }

    var isDisrupted: Bool { self != .onTime && self != .early }
    var isCritical: Bool { [.severelyDelayed, .cancelled, .skipped, .stalled, .endingEarly].contains(self) }
}

enum LiveDataState: String, Codable, Hashable {
    case live
    case stale
    case unavailable
}

struct TransitDataHealth: Codable, Hashable {
    let departures: LiveDataState
    let vehicles: LiveDataState
    let alerts: LiveDataState
    let generatedAt: Date?

    static let unavailable = TransitDataHealth(
        departures: .unavailable,
        vehicles: .unavailable,
        alerts: .unavailable,
        generatedAt: nil
    )

    var isLive: Bool { departures == .live }
}

struct VehicleObservation: Codable, Hashable {
    let vehicleID: String
    let routeID: String
    let latitude: Double
    let longitude: Double
    let observedAt: Date
    let feedTimestamp: Date?
}

struct VehicleServiceHealth: Codable, Identifiable, Hashable {
    let vehicleID: String
    let routeID: String
    let tripID: String?
    let condition: ServiceCondition
    let stationaryMinutes: Int
    let observedAt: Date

    var id: String { vehicleID }
}

struct AlternativeService: Identifiable, Hashable {
    let stop: TransitStop
    let arrival: Arrival
    let walkingMinutes: Int

    var id: String { "\(stop.id)-\(arrival.id)" }
    var totalMinutes: Int { walkingMinutes + max(0, arrival.minutesAway) }
}

struct RouteShapeSection: Identifiable {
    let id: String
    let route: TransitRoute
    let coordinates: [CLLocationCoordinate2D]
}
