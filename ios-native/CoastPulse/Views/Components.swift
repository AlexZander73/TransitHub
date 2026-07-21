import SwiftUI

struct RouteBadge: View {
    let routeID: String
    let route: TransitRoute?

    var body: some View {
        Text(route?.shortName ?? routeID)
            .font(.system(.caption, design: .rounded, weight: .heavy))
            .foregroundStyle(Color(hex: route?.textColor ?? "FFFFFF"))
            .frame(minWidth: 34, minHeight: 28)
            .padding(.horizontal, 4)
            .background(Color(hex: route?.color ?? "087F8C"), in: RoundedRectangle(cornerRadius: 6))
            .accessibilityLabel("Route \(route?.shortName ?? routeID)")
    }
}

struct ModePill: View {
    let mode: String

    var body: some View {
        let transitMode = TransitMode(rawValue: mode) ?? .interchange
        Label(mode.capitalized, systemImage: transitMode.symbol)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(.quaternary, in: Capsule())
    }
}

struct ArrivalRow: View {
    let arrival: Arrival
    let route: TransitRoute?
    let theme: TransitTheme

    var body: some View {
        HStack(spacing: 12) {
            RouteBadge(routeID: arrival.routeId, route: route)
            VStack(alignment: .leading, spacing: 3) {
                Text(arrival.headsign)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Image(systemName: arrival.condition.symbol)
                    Text(arrival.statusText)
                        .foregroundStyle(arrival.condition.color)
                    if let platform = arrival.platform, !platform.isEmpty { Text("Platform \(platform)") }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(arrival.isBoardable ? (arrival.minutesAway == 0 ? "Due" : "\(arrival.minutesAway) min") : arrival.departure.shortTransitTime)
                    .font(.headline.monospacedDigit())
                if let scheduled = arrival.scheduledDeparture,
                   arrival.condition == .delayed || arrival.condition == .severelyDelayed {
                    Text("was \(scheduled.shortTransitTime)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
    }
}

extension ServiceCondition {
    var symbol: String {
        switch self {
        case .onTime: "checkmark.circle.fill"
        case .early: "arrow.up.right.circle.fill"
        case .delayed: "clock.badge.exclamationmark.fill"
        case .severelyDelayed: "exclamationmark.triangle.fill"
        case .cancelled: "xmark.octagon.fill"
        case .skipped: "arrow.right.circle.fill"
        case .noData, .trackingUnavailable: "wifi.slash"
        case .stalled: "pause.circle.fill"
        case .replaced: "arrow.triangle.2.circlepath.circle.fill"
        case .endingEarly: "arrow.turn.down.left"
        }
    }

    var color: Color {
        switch self {
        case .onTime: .green
        case .early: .blue
        case .delayed: .orange
        case .severelyDelayed, .cancelled, .skipped, .endingEarly: .red
        case .noData, .trackingUnavailable: .secondary
        case .stalled: .purple
        case .replaced: .cyan
        }
    }
}

struct DataHealthBadge: View {
    let health: TransitDataHealth
    let updatedAt: Date?

    var body: some View {
        Label(label, systemImage: symbol)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 7))
            .accessibilityLabel(accessibilityText)
    }

    private var label: String {
        switch health.departures {
        case .live: updatedAt.map { "Updated \($0.formatted(.relative(presentation: .numeric)))" } ?? "Live"
        case .stale: "Timetable mode"
        case .unavailable: "Live unavailable"
        }
    }

    private var symbol: String {
        switch health.departures {
        case .live: "dot.radiowaves.left.and.right"
        case .stale: "clock.badge.exclamationmark"
        case .unavailable: "wifi.slash"
        }
    }

    private var color: Color {
        switch health.departures {
        case .live: .green
        case .stale: .orange
        case .unavailable: .secondary
        }
    }

    private var accessibilityText: String { "Transit data: \(label)" }
}

struct EmptyStateView: View {
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        ContentUnavailableView(title, systemImage: symbol, description: Text(message))
    }
}

struct FloatingIconButton: View {
    let symbol: String
    let label: String
    var active = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .semibold))
                .frame(width: 42, height: 42)
                .foregroundStyle(active ? Color.white : Color.accentColor)
                .background(active ? Color.accentColor : Color.clear, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct AlertSeverityIcon: View {
    let severity: Int

    var body: some View {
        Image(systemName: severity >= 3 ? "exclamationmark.octagon.fill" : severity == 2 ? "exclamationmark.triangle.fill" : "info.circle.fill")
            .foregroundStyle(severity >= 3 ? .red : severity == 2 ? .orange : .blue)
            .font(.title3)
    }
}
