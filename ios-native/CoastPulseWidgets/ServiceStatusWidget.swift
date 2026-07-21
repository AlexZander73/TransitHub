import SwiftUI
import WidgetKit

struct ServiceStatusWidget: Widget {
    let kind = "ServiceStatusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TransitWidgetProvider()) { entry in
            ServiceStatusWidgetView(entry: entry)
                .containerBackground(for: .widget) { Color(hex: "F3F4F5") }
        }
        .configurationDisplayName("Service status")
        .description("Keep an eye on notices affecting your favourite stop.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

private struct ServiceStatusWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TransitWidgetEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 1) {
                    Image(systemName: statusSymbol)
                    Text("\(entry.snapshot.activeAlertCount)").font(.caption2.monospacedDigit())
                }
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.snapshot.stopName).font(.headline).lineLimit(1)
                Text(statusText).font(.caption).lineLimit(2)
            }
        default:
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: statusSymbol)
                    .font(.largeTitle)
                    .foregroundStyle(statusColor)
                Spacer()
                Text(entry.snapshot.stopName).font(.headline).lineLimit(2)
                Text(statusText).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var statusText: String {
        if entry.snapshot.dataState == .stale { return "Live feed delayed; timetable mode" }
        if entry.snapshot.dataState == .unavailable { return "Live updates unavailable" }
        if let departure = entry.snapshot.departures.first,
           ServiceCondition(status: departure.status, delayMinutes: departure.delayMinutes).isDisrupted {
            return departure.delayMinutes > 0 ? "Next service \(departure.delayMinutes) min late" : departure.status.replacingOccurrences(of: "_", with: " ").capitalized
        }
        return entry.snapshot.activeAlertCount == 0
            ? "No relevant service notices"
            : "\(entry.snapshot.activeAlertCount) active service notice\(entry.snapshot.activeAlertCount == 1 ? "" : "s")"
    }

    private var statusSymbol: String {
        if entry.snapshot.dataState != .live { return "wifi.slash" }
        if entry.snapshot.activeAlertCount > 0 { return "exclamationmark.triangle.fill" }
        if let departure = entry.snapshot.departures.first,
           ServiceCondition(status: departure.status, delayMinutes: departure.delayMinutes).isDisrupted {
            return "clock.badge.exclamationmark.fill"
        }
        return "checkmark.seal.fill"
    }

    private var statusColor: Color {
        entry.snapshot.dataState == .live && entry.snapshot.activeAlertCount == 0 ? .green : .orange
    }
}
