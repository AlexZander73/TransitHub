import Foundation
import MapKit

@MainActor
final class TransitRepository: ObservableObject {
    @Published private(set) var regions: [TransitRegion] = []
    @Published private(set) var stops: [TransitStop] = []
    @Published private(set) var routes: [TransitRoute] = []
    @Published private(set) var shapes: [String: RouteShapeGroup] = [:]
    @Published private(set) var departuresByStop: [String: [TransitDeparture]] = [:]
    @Published private(set) var serviceIncidents: [ServiceIncident] = []
    @Published private(set) var vehicles: [TransitVehicle] = []
    @Published private(set) var vehicleHealth: [VehicleServiceHealth] = []
    @Published private(set) var alerts: [TransitAlert] = []
    @Published private(set) var dataHealth: TransitDataHealth = .unavailable
    @Published private(set) var isLoading = false
    @Published private(set) var lastUpdated: Date?
    @Published private(set) var errorMessage: String?

    private let remoteBaseURL = URL(string: "https://alexzander73.github.io/TransitHub/data/")!
    private let liveMaxAge: TimeInterval = 20 * 60
    private let decoder = JSONDecoder()
    private var departureDataIsFresh = false

    var stopByID: [String: TransitStop] { Dictionary(uniqueKeysWithValues: stops.map { ($0.id, $0) }) }
    var routeByID: [String: TransitRoute] { Dictionary(uniqueKeysWithValues: routes.map { ($0.id, $0) }) }

    func bootstrap() async {
        guard stops.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        do {
            let regionPayload: RegionPayload = try decodeBundled("regions")
            let stopPayload: StopPayload = try decodeBundled("stops")
            let routePayload: RoutePayload = try decodeBundled("routes")
            let shapePayload: RouteShapePayload = try decodeBundled("route-shapes")
            regions = regionPayload.regions
            stops = stopPayload.stops
            routes = routePayload.routes
            shapes = shapePayload.routes
            await refreshLiveData()
        } catch {
            errorMessage = "The bundled transit network could not be loaded."
        }
        isLoading = false
    }

    func refreshLiveData() async {
        async let departuresResult: DeparturePayload? = loadBestLivePayload("departures.live")
        async let vehiclesResult: VehiclePayload? = loadBestLivePayload("vehicles.live")
        async let alertsResult: AlertPayload? = loadBestLivePayload("alerts.live")

        let (departurePayload, vehiclePayload, alertPayload) = await (
            departuresResult,
            vehiclesResult,
            alertsResult
        )

        if let departurePayload {
            departuresByStop = departurePayload.stops
            serviceIncidents = departurePayload.incidents ?? []
            departureDataIsFresh = isFresh(departurePayload.meta)
        }
        if let vehiclePayload {
            let freshVehicles = isFresh(vehiclePayload.meta) ? vehiclePayload.vehicles : []
            vehicleHealth = inferVehicleHealth(from: freshVehicles)
            vehicles = freshVehicles
        }
        if let alertPayload {
            alerts = alertPayload.alerts.filter { $0.isActive() }
        }

        lastUpdated = [departurePayload?.meta, vehiclePayload?.meta, alertPayload?.meta]
            .compactMap { $0?.generatedDate }
            .max()
        dataHealth = TransitDataHealth(
            departures: liveState(departurePayload?.meta),
            vehicles: liveState(vehiclePayload?.meta),
            alerts: liveState(alertPayload?.meta),
            generatedAt: lastUpdated
        )
    }

    func stops(in regionID: String) -> [TransitStop] {
        stops.filter { $0.region == regionID }
    }

    func routes(in regionID: String) -> [TransitRoute] {
        routes.filter { $0.region == regionID && $0.status == "active" }
    }

    func vehicles(in regionID: String, showTrams: Bool = true, showBuses: Bool = true) -> [TransitVehicle] {
        let routeIDs = Set(routes(in: regionID).map(\.id))
        return vehicles.filter {
            routeIDs.contains($0.routeId)
                && (($0.mode == "tram" && showTrams) || ($0.mode == "bus" && showBuses))
                && ($0.updatedDate.map { Date.now.timeIntervalSince($0) <= liveMaxAge } ?? true)
        }
    }

    func shapeSections(in regionID: String, showTrams: Bool, showBuses: Bool) -> [RouteShapeSection] {
        routes(in: regionID).flatMap { route -> [RouteShapeSection] in
            guard (route.mode == "tram" && showTrams) || (route.mode == "bus" && showBuses) else { return [] }
            if let shapeGroup = shapes[route.id], !shapeGroup.shapes.isEmpty {
                return shapeGroup.shapes.map { shape in
                    RouteShapeSection(
                        id: "\(route.id)-\(shape.directionId)",
                        route: route,
                        coordinates: shape.coordinates
                    )
                }
            }
            let coordinates = route.stopSequence.compactMap { stopByID[$0]?.coordinate }
            guard coordinates.count > 1 else { return [] }
            return [RouteShapeSection(id: "\(route.id)-fallback", route: route, coordinates: coordinates)]
        }
    }

    func nearestStop(to coordinate: CLLocationCoordinate2D, in regionID: String? = nil) -> TransitStop? {
        let candidates = regionID.map { stops(in: $0) } ?? stops
        return candidates.min { lhs, rhs in
            lhs.coordinate.distance(to: coordinate) < rhs.coordinate.distance(to: coordinate)
        }
    }

    func distance(to stop: TransitStop, from coordinate: CLLocationCoordinate2D?) -> CLLocationDistance? {
        coordinate.map { stop.coordinate.distance(to: $0) }
    }

    func arrivals(for stopID: String, now: Date = .now, limit: Int = 8) -> [Arrival] {
        let live = liveArrivals(for: stopID, now: now)
        let scheduled = scheduledArrivals(for: stopID, now: now).filter { candidate in
            !live.contains { liveArrival in
                guard liveArrival.routeId == candidate.routeId,
                      liveArrival.headsign.localizedCaseInsensitiveCompare(candidate.headsign) == .orderedSame
                else { return false }
                let comparison = liveArrival.scheduledDeparture ?? liveArrival.departure
                return abs(comparison.timeIntervalSince(candidate.departure)) < 8 * 60
            }
        }
        var seen = Set<String>()
        return (live + scheduled)
            .sorted { $0.departure < $1.departure }
            .filter {
                let roundedMinute = Int($0.departure.timeIntervalSince1970 / 60)
                let key = "\($0.routeId)|\($0.headsign)|\(roundedMinute)"
                return seen.insert(key).inserted
            }
            .prefix(limit)
            .map { $0 }
    }

    func alerts(for stop: TransitStop) -> [TransitAlert] {
        let routeIDs = Set(stop.routes)
        return alerts
            .filter { alert in
                alert.isActive()
                    && (alert.region == nil || alert.region == stop.region)
                    && (alert.stops.contains(stop.id)
                        || alert.routes.contains(where: routeIDs.contains)
                        || (stop.interchangeId.map { alert.interchanges.contains($0) } ?? false))
            }
            .sorted { $0.severity > $1.severity }
    }

    func incidents(for stop: TransitStop) -> [ServiceIncident] {
        serviceIncidents.filter { incident in
            incident.stopIds.contains(stop.id) || stop.routes.contains(incident.routeId)
        }
    }

    func vehicleHealth(for routeID: String) -> [VehicleServiceHealth] {
        vehicleHealth.filter { $0.routeID == routeID && $0.condition.isDisrupted }
    }

    func alternatives(
        for stop: TransitStop,
        excluding arrival: Arrival? = nil,
        userCoordinate: CLLocationCoordinate2D? = nil,
        limit: Int = 3
    ) -> [AlternativeService] {
        let candidateIDs = [stop.id] + (stop.nearbyStopIds ?? [])
        var seenRoutes = Set<String>()
        var options: [AlternativeService] = []
        for stopID in candidateIDs {
            guard let candidateStop = stopByID[stopID] else { continue }
            let walkingDistance = userCoordinate.map { candidateStop.coordinate.distance(to: $0) }
                ?? candidateStop.coordinate.distance(to: stop.coordinate)
            let walkingMinutes = Int(ceil(walkingDistance / 78.0))
            for item in arrivals(for: stopID, limit: 6) {
                guard item.isBoardable,
                      item.id != arrival?.id,
                      item.routeId != arrival?.routeId,
                      seenRoutes.insert(item.routeId).inserted else { continue }
                options.append(AlternativeService(stop: candidateStop, arrival: item, walkingMinutes: walkingMinutes))
                if options.count >= limit * 2 { break }
            }
        }
        return options.sorted { lhs, rhs in
            lhs.totalMinutes == rhs.totalMinutes
                ? lhs.arrival.departure < rhs.arrival.departure
                : lhs.totalMinutes < rhs.totalMinutes
        }
        .prefix(limit)
        .map { $0 }
    }

    func activeAlerts(in regionID: String) -> [TransitAlert] {
        let regionalStops = stops.filter { $0.region == regionID }
        let stopIDs = Set(regionalStops.map(\.id))
        let interchangeIDs = Set(regionalStops.compactMap(\.interchangeId))
        let routeIDs = Set(
            routes
                .filter { $0.region == regionID }
                .flatMap { [$0.id, $0.shortName] }
        )
        let regionLabel = regions.first(where: { $0.id == regionID })?.label.lowercased() ?? regionID

        return alerts
            .filter { alert in
                guard alert.isActive() else { return false }
                if let region = alert.region { return region == regionID }
                if alert.routes.contains(where: routeIDs.contains) { return true }
                if alert.stops.contains(where: stopIDs.contains) { return true }
                if alert.interchanges.contains(where: interchangeIDs.contains) { return true }
                let searchableText = "\(alert.title) \(alert.description)".lowercased()
                return searchableText.contains(regionLabel)
            }
            .sorted { lhs, rhs in
                lhs.severity == rhs.severity ? lhs.title < rhs.title : lhs.severity > rhs.severity
            }
    }

    func writeWidgetSnapshot(for stopID: String?) {
        guard let stopID, let stop = stopByID[stopID] else {
            AppGroupStore.write(snapshot: .placeholder)
            return
        }
        let arrivals = arrivals(for: stopID, limit: 4)
        let snapshot = WidgetTransitSnapshot(
            stopID: stop.id,
            stopName: stop.name,
            stopCode: stop.code,
            updatedAt: .now,
            departures: arrivals.map {
                WidgetDeparture(
                    id: $0.id,
                    routeID: routeByID[$0.routeId]?.shortName ?? $0.routeId,
                    headsign: $0.headsign,
                    departure: $0.departure,
                    isLive: $0.source == .live,
                    status: $0.status,
                    delayMinutes: $0.delayMinutes,
                    platform: $0.platform
                )
            },
            activeAlertCount: alerts(for: stop).count,
            serviceMessage: widgetServiceMessage(arrivals: arrivals, stop: stop),
            dataState: dataHealth.departures
        )
        AppGroupStore.write(snapshot: snapshot)
        AppGroupStore.defaults.set(stop.routes, forKey: AppGroupStore.Key.notificationRoutes)
    }

    private func liveArrivals(for stopID: String, now: Date) -> [Arrival] {
        guard departureDataIsFresh else { return [] }
        return departuresByStop[stopID, default: []].compactMap { item in
            guard let departure = item.departureDate,
                  departure >= now.addingTimeInterval(-60),
                  departure <= now.addingTimeInterval(4 * 60 * 60) else { return nil }
            return Arrival(
                id: "live-\(item.id)",
                routeId: item.routeId,
                headsign: item.headsign,
                departure: departure,
                scheduledDeparture: item.scheduledTime.flatMap(FlexibleDate.parse),
                platform: item.platform,
                status: item.status,
                delayMinutes: item.delayMinutes,
                source: .live
            )
        }
    }

    private func scheduledArrivals(for stopID: String, now: Date) -> [Arrival] {
        routes.filter { $0.stopSequence.contains(stopID) }.flatMap { route in
            route.directions.flatMap { direction in
                scheduledArrivals(route: route, direction: direction, stopID: stopID, now: now)
            }
        }
    }

    private func scheduledArrivals(
        route: TransitRoute,
        direction: RouteDirection,
        stopID: String,
        now: Date
    ) -> [Arrival] {
        let calendar = brisbaneCalendar
        let profileKey = calendar.isDateInWeekend(now) ? "weekend" : "weekday"
        guard let profile = direction.service[profileKey] ?? route.serviceSpan[profileKey],
              let originIndex = route.stopSequence.firstIndex(of: direction.originStopId),
              let stopIndex = route.stopSequence.firstIndex(of: stopID),
              let destinationIndex = route.stopSequence.firstIndex(of: direction.destinationStopId),
              let first = serviceDate(profile.first, relativeTo: now, calendar: calendar),
              var last = serviceDate(profile.last, relativeTo: now, calendar: calendar) else { return [] }

        let movingForward = originIndex <= destinationIndex
        guard (movingForward && stopIndex >= originIndex && stopIndex <= destinationIndex)
                || (!movingForward && stopIndex <= originIndex && stopIndex >= destinationIndex) else { return [] }

        let offset: Int
        if movingForward {
            offset = route.segmentMinutes[originIndex..<stopIndex].reduce(0, +)
        } else {
            offset = route.segmentMinutes[stopIndex..<originIndex].reduce(0, +)
        }

        if last < first { last = calendar.date(byAdding: .day, value: 1, to: last) ?? last }
        var service = first
        var output: [Arrival] = []
        let windowEnd = now.addingTimeInterval(2 * 60 * 60)

        while service <= last {
            let departure = service.addingTimeInterval(TimeInterval(offset * 60))
            if departure >= now.addingTimeInterval(-60), departure <= windowEnd {
                output.append(
                    Arrival(
                        id: "scheduled-\(route.id)-\(direction.id)-\(Int(service.timeIntervalSince1970))",
                        routeId: route.id,
                        headsign: direction.headsign,
                        departure: departure,
                        scheduledDeparture: departure,
                        platform: nil,
                        status: "scheduled",
                        delayMinutes: 0,
                        source: .scheduled
                    )
                )
            }
            service = service.addingTimeInterval(TimeInterval(max(1, profile.frequencyMins) * 60))
        }
        return output
    }

    private var brisbaneCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Australia/Brisbane") ?? .current
        return calendar
    }

    private func serviceDate(_ value: String, relativeTo date: Date, calendar: Calendar) -> Date? {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return nil }
        return calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: date)
    }

    private func isFresh(_ meta: DatasetMeta?) -> Bool {
        liveState(meta) == .live
    }

    private func liveState(_ meta: DatasetMeta?) -> LiveDataState {
        guard let generated = meta?.generatedDate else { return .unavailable }
        return Date.now.timeIntervalSince(generated) <= liveMaxAge ? .live : .stale
    }

    private func widgetServiceMessage(arrivals: [Arrival], stop: TransitStop) -> String {
        if dataHealth.departures == .stale { return "Live feed delayed - timetable shown" }
        if dataHealth.departures == .unavailable { return "Timetable - live feed unavailable" }
        if let disrupted = arrivals.first(where: { $0.condition.isDisrupted }) { return disrupted.statusText }
        if !incidents(for: stop).isEmpty { return "Service disruption reported" }
        return arrivals.first?.source == .live ? "Live arrivals" : "Scheduled timetable"
    }

    private func inferVehicleHealth(from newVehicles: [TransitVehicle], now: Date = .now) -> [VehicleServiceHealth] {
        let previous: [String: VehicleObservation]
        if let data = AppGroupStore.defaults.data(forKey: AppGroupStore.Key.vehicleObservations),
           let decoded = try? decoder.decode([String: VehicleObservation].self, from: data) {
            previous = decoded
        } else {
            previous = [:]
        }

        var next: [String: VehicleObservation] = [:]
        var health: [VehicleServiceHealth] = []
        for vehicle in newVehicles {
            let feedDate = vehicle.timestamp.map { Date(timeIntervalSince1970: $0) } ?? vehicle.updatedDate
            let observation = VehicleObservation(
                vehicleID: vehicle.id,
                routeID: vehicle.routeId,
                latitude: vehicle.lat,
                longitude: vehicle.lon,
                observedAt: now,
                feedTimestamp: feedDate
            )
            next[vehicle.id] = observation
            guard let prior = previous[vehicle.id] else { continue }
            let elapsed = now.timeIntervalSince(prior.observedAt)
            guard elapsed >= 12 * 60, elapsed <= 45 * 60 else { continue }
            let oldCoordinate = CLLocationCoordinate2D(latitude: prior.latitude, longitude: prior.longitude)
            let moved = oldCoordinate.distance(to: vehicle.coordinate)
            let threshold: TimeInterval = vehicle.status.contains("stopped") ? 20 * 60 : 12 * 60
            if elapsed >= threshold, moved < 75, (vehicle.speed ?? 0) < 1.5 {
                health.append(
                    VehicleServiceHealth(
                        vehicleID: vehicle.id,
                        routeID: vehicle.routeId,
                        tripID: vehicle.tripId,
                        condition: .stalled,
                        stationaryMinutes: Int(elapsed / 60),
                        observedAt: now
                    )
                )
            }
        }
        if let data = try? JSONEncoder().encode(next) {
            AppGroupStore.defaults.set(data, forKey: AppGroupStore.Key.vehicleObservations)
        }
        return health
    }

    private func decodeBundled<T: Decodable>(_ name: String) throws -> T {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "data") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try decoder.decode(T.self, from: Data(contentsOf: url))
    }

    private func loadBestLivePayload<T: Decodable>(_ name: String) async -> T? {
        var candidates: [Data] = []
        let remoteURL = remoteBaseURL.appendingPathComponent("\(name).json")
        if let remote = try? await request(remoteURL) {
            candidates.append(remote)
            try? remote.write(to: cacheURL(name), options: .atomic)
        }
        if let cached = try? Data(contentsOf: cacheURL(name)) { candidates.append(cached) }
        if let bundledURL = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "data"),
           let bundled = try? Data(contentsOf: bundledURL) {
            candidates.append(bundled)
        }
        return candidates
            .sorted { payloadDate($0) > payloadDate($1) }
            .compactMap { try? decoder.decode(T.self, from: $0) }
            .first
    }

    private func request(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 8)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return data
    }

    private func payloadDate(_ data: Data) -> Date {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let meta = object["meta"] as? [String: Any],
              let value = meta["generatedAt"] as? String,
              let date = FlexibleDate.parse(value) else { return .distantPast }
        return date
    }

    private func cacheURL(_ name: String) -> URL {
        let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LiveTransit", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("\(name).json")
    }
}
