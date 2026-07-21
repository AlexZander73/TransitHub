import CoreLocation
import XCTest
@testable import CoastPulse

final class TransitCoreTests: XCTestCase {
    func testFlexibleDateParsesFractionalISO8601() {
        XCTAssertNotNil(FlexibleDate.parse("2026-07-15T11:37:53.343Z"))
    }

    func testCoordinateDistanceIsSymmetric() {
        let a = CLLocationCoordinate2D(latitude: -28.002, longitude: 153.414)
        let b = CLLocationCoordinate2D(latitude: -28.035, longitude: 153.431)
        XCTAssertEqual(a.distance(to: b), b.distance(to: a), accuracy: 0.01)
        XCTAssertGreaterThan(a.distance(to: b), 3_000)
    }

    func testWidgetSnapshotRoundTrip() throws {
        let snapshot = WidgetTransitSnapshot(
            stopID: "BBS",
            stopName: "Broadbeach South",
            stopCode: "BBS",
            updatedAt: .now,
            departures: [.init(
                id: "1",
                routeID: "G",
                headsign: "Helensvale",
                departure: .now,
                isLive: true,
                status: "minor_delay",
                delayMinutes: 4,
                platform: "1"
            )],
            activeAlertCount: 1,
            serviceMessage: "Live arrivals",
            dataState: .live
        )
        let decoded = try JSONDecoder().decode(WidgetTransitSnapshot.self, from: JSONEncoder().encode(snapshot))
        XCTAssertEqual(decoded.stopID, "BBS")
        XCTAssertEqual(decoded.departures.first?.routeID, "G")
    }

    func testServiceConditionUsesSevereDelayThreshold() {
        XCTAssertEqual(ServiceCondition(status: "minor_delay", delayMinutes: 4), .delayed)
        XCTAssertEqual(ServiceCondition(status: "minor_delay", delayMinutes: 12), .severelyDelayed)
        XCTAssertEqual(ServiceCondition(status: "CANCELED", delayMinutes: 0), .cancelled)
    }

    func testArrivalStatusTextFormatsDelayValues() {
        let arrival = Arrival(
            id: "trip",
            routeId: "700",
            headsign: "Tweed Heads",
            departure: .now,
            scheduledDeparture: .now.addingTimeInterval(-7 * 60),
            platform: nil,
            status: "minor_delay",
            delayMinutes: 7,
            source: .live
        )
        XCTAssertEqual(arrival.statusText, "7 min late")
    }

    func testOvernightCommuteWindowUsesPreviousWeekday() throws {
        let watch = CommuteWatch(
            stopID: "BBS",
            weekdays: [2],
            startMinute: 22 * 60,
            endMinute: 2 * 60
        )
        let calendar = Calendar.brisbane
        let mondayLate = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 7, day: 20, hour: 23)))
        let tuesdayEarly = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 7, day: 21, hour: 1)))
        XCTAssertTrue(watch.isActive(at: mondayLate, calendar: calendar))
        XCTAssertTrue(watch.isActive(at: tuesdayEarly, calendar: calendar))
    }

    func testCommuteAlertEngineReportsThresholdDelay() throws {
        let calendar = Calendar.brisbane
        let now = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 7, day: 20, hour: 8)))
        let watch = CommuteWatch(
            name: "Work",
            stopID: "BBS",
            routeIDs: ["G"],
            weekdays: [2],
            startMinute: 7 * 60,
            endMinute: 9 * 60,
            delayThreshold: 5
        )
        let arrival = Arrival(
            id: "trip-1",
            routeId: "G",
            headsign: "Helensvale",
            departure: now.addingTimeInterval(15 * 60),
            scheduledDeparture: now.addingTimeInterval(8 * 60),
            platform: "1",
            status: "minor_delay",
            delayMinutes: 7,
            source: .live
        )
        let events = CommuteAlertEngine.events(
            watches: [watch],
            arrivalsByStop: ["BBS": [arrival]],
            incidents: [],
            alerts: [],
            vehicleHealth: [],
            now: now,
            calendar: calendar
        )
        XCTAssertEqual(events.map(\.kind), [.delayed])
    }

    func testAlertDescriptionRestoresMissingSentenceSpacing() {
        let alert = TransitAlert(
            id: "alert",
            region: nil,
            level: "warning",
            severity: 2,
            title: "Service update",
            description: "First sentence.Second sentence:Timetable changesM216.",
            routes: [],
            stops: [],
            interchanges: [],
            effectiveFrom: nil,
            effectiveTo: nil,
            status: "active",
            impact: nil
        )

        XCTAssertEqual(alert.readableDescription, "First sentence. Second sentence: Timetable changes M216.")
    }
}
