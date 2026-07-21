import Foundation

enum CommuteAlertEngine {
    static func events(
        watches: [CommuteWatch],
        arrivalsByStop: [String: [Arrival]],
        incidents: [ServiceIncident],
        alerts: [TransitAlert],
        vehicleHealth: [VehicleServiceHealth],
        now: Date = .now,
        calendar: Calendar = .brisbane
    ) -> [CommuteEvent] {
        watches.filter { $0.isActive(at: now, calendar: calendar) }.flatMap { watch in
            var events: [CommuteEvent] = []
            let arrivals = arrivalsByStop[watch.stopID, default: []]
                .filter { watch.matches(routeID: $0.routeId, headsign: $0.headsign) }

            for arrival in arrivals.prefix(4) {
                switch arrival.condition {
                case .delayed where watch.notifyDelay && arrival.delayMinutes >= watch.delayThreshold,
                     .severelyDelayed where watch.notifyDelay && arrival.delayMinutes >= watch.delayThreshold:
                    events.append(event(
                        watch: watch,
                        kind: .delayed,
                        title: "\(watch.name): \(arrival.statusText)",
                        body: "Route \(arrival.routeId) to \(arrival.headsign) is now expected at \(arrival.departure.shortTransitTime).",
                        routeID: arrival.routeId,
                        tripID: stableTripID(arrival.id),
                        date: arrival.departure
                    ))
                case .cancelled where watch.notifyCancellation:
                    events.append(event(
                        watch: watch,
                        kind: .cancelled,
                        title: "\(watch.name): service cancelled",
                        body: "Route \(arrival.routeId) to \(arrival.headsign) has been cancelled. Open CoastPulse for alternatives.",
                        routeID: arrival.routeId,
                        tripID: stableTripID(arrival.id),
                        date: arrival.departure
                    ))
                case .skipped where watch.notifySkippedStop:
                    events.append(event(
                        watch: watch,
                        kind: .skipped,
                        title: "\(watch.name): not stopping",
                        body: "Route \(arrival.routeId) will not stop at your watched stop. Open CoastPulse for alternatives.",
                        routeID: arrival.routeId,
                        tripID: stableTripID(arrival.id),
                        date: arrival.departure
                    ))
                default: break
                }
            }

            for incident in incidents where incident.stopIds.contains(watch.stopID)
                && watch.matches(routeID: incident.routeId, headsign: incident.headsign) {
                let enabled = switch incident.condition {
                case .cancelled: watch.notifyCancellation
                case .skipped: watch.notifySkippedStop
                default: watch.notifyDelay
                }
                guard enabled else { continue }
                events.append(event(
                    watch: watch,
                    kind: incident.condition == .skipped ? .skipped : .cancelled,
                    title: "\(watch.name): \(incident.condition == .skipped ? "stop skipped" : "service cancelled")",
                    body: incident.detail ?? "Route \(incident.routeId) to \(incident.headsign) is disrupted.",
                    routeID: incident.routeId,
                    tripID: incident.tripId ?? incident.id,
                    date: incident.expectedDate ?? now
                ))
            }

            if watch.notifyServiceAlerts {
                let routeSet = Set(watch.routeIDs)
                for alert in alerts where alert.isActive(at: now)
                    && (alert.stops.contains(watch.stopID)
                        || (!routeSet.isEmpty && alert.routes.contains(where: routeSet.contains))) {
                    events.append(event(
                        watch: watch,
                        kind: .serviceAlert,
                        title: alert.title,
                        body: alert.readableDescription,
                        routeID: alert.routes.first,
                        tripID: alert.id,
                        date: now
                    ))
                }
            }

            if watch.notifyStalledVehicle {
                for health in vehicleHealth where health.condition == .stalled
                    && (watch.routeIDs.isEmpty || watch.routeIDs.contains(health.routeID)) {
                    events.append(event(
                        watch: watch,
                        kind: .stalled,
                        title: "\(watch.name): vehicle may be stalled",
                        body: "A route \(health.routeID) vehicle has not moved for about \(health.stationaryMinutes) minutes.",
                        routeID: health.routeID,
                        tripID: health.tripID ?? health.vehicleID,
                        date: now
                    ))
                }
            }
            return events
        }
    }

    private static func event(
        watch: CommuteWatch,
        kind: CommuteEventKind,
        title: String,
        body: String,
        routeID: String?,
        tripID: String?,
        date: Date
    ) -> CommuteEvent {
        CommuteEvent(
            watchID: watch.id,
            kind: kind,
            title: title,
            body: body,
            stopID: watch.stopID,
            routeID: routeID,
            tripID: tripID,
            eventDate: date
        )
    }

    private static func stableTripID(_ value: String) -> String {
        value.hasPrefix("live-") ? String(value.dropFirst("live-".count)) : value
    }
}
