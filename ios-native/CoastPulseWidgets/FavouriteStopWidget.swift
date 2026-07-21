import SwiftUI
import WidgetKit

struct NextDepartureWidget: Widget {
    let kind = "NextDepartureWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TransitWidgetProvider()) { entry in
            NextDepartureWidgetView(entry: entry)
                .containerBackground(for: .widget) { Color(hex: "071B2E") }
        }
        .configurationDisplayName("Next departures")
        .description("See upcoming services from your favourite stop.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

private struct NextDepartureWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TransitWidgetEntry

    var body: some View {
        if family == .accessoryInline {
            inlineView
        } else if family == .accessoryRectangular {
            rectangularView
        } else {
            homeScreenView
        }
    }

    private var homeScreenView: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "wave.3.right.circle.fill")
                    .foregroundStyle(Color(hex: "20C7D6"))
                Text(entry.snapshot.stopName)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }

            if entry.snapshot.departures.isEmpty {
                Spacer()
                Text(entry.snapshot.serviceMessage)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.72))
                Spacer()
            } else {
                ForEach(Array(entry.snapshot.departures.prefix(family == .systemSmall ? 2 : 3))) { departure in
                    HStack(spacing: 8) {
                        Text(departure.routeID)
                            .font(.caption.weight(.heavy))
                            .foregroundStyle(Color(hex: "071B2E"))
                            .frame(minWidth: 30, minHeight: 23)
                            .background(Color(hex: "7DE1D7"), in: RoundedRectangle(cornerRadius: 5))
                        Text(departure.headsign)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Text(departure.minutesAway == 0 ? "Due" : "\(departure.minutesAway)m")
                            .font(.caption.monospacedDigit().weight(.bold))
                            .foregroundStyle(.white)
                        if ServiceCondition(status: departure.status, delayMinutes: departure.delayMinutes).isDisrupted {
                            Image(systemName: conditionSymbol(departure))
                                .font(.caption2)
                                .foregroundStyle(conditionColor(departure))
                        }
                    }
                }
            }
            Spacer(minLength: 0)
            Text(entry.snapshot.serviceMessage)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color(hex: "A9C4CF"))
        }
        .widgetURL(stopURL)
    }

    private var rectangularView: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(entry.snapshot.stopName).font(.headline).lineLimit(1)
            if let departure = entry.snapshot.departures.first {
                Text("\(departure.routeID) to \(departure.headsign)").font(.caption).lineLimit(1)
                Text(departure.departure, style: .timer).font(.caption.monospacedDigit())
            } else {
                Text("No upcoming service").font(.caption)
            }
        }
        .widgetURL(stopURL)
    }

    private var inlineView: some View {
        Group {
            if let departure = entry.snapshot.departures.first {
                Text("\(departure.routeID) in \(departure.minutesAway) min")
            } else {
                Text("CoastPulse: no service")
            }
        }
        .widgetURL(stopURL)
    }

    private var stopURL: URL? {
        entry.snapshot.stopID.flatMap { URL(string: "coastpulse://stop/\($0)") }
    }

    private func conditionSymbol(_ departure: WidgetDeparture) -> String {
        switch ServiceCondition(status: departure.status, delayMinutes: departure.delayMinutes) {
        case .cancelled: "xmark.octagon.fill"
        case .skipped: "arrow.right.circle.fill"
        case .severelyDelayed: "exclamationmark.triangle.fill"
        default: "clock.badge.exclamationmark.fill"
        }
    }

    private func conditionColor(_ departure: WidgetDeparture) -> Color {
        ServiceCondition(status: departure.status, delayMinutes: departure.delayMinutes).isCritical ? .red : .orange
    }
}
