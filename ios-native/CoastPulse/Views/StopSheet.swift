import SwiftUI

struct StopSheet: View {
    let stop: TransitStop

    @EnvironmentObject private var repository: TransitRepository
    @EnvironmentObject private var settings: UserSettings
    @EnvironmentObject private var liveActivities: LiveActivityManager
    @Environment(\.dismiss) private var dismiss
    @State private var editingWatch: CommuteWatch?

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 30)) { _ in
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        header
                        actionRow
                        dataStatus
                        arrivalsSection
                        incidentsSection
                        alternativesSection
                        alertsSection
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 28)
                }
            }
            .background(settings.theme.page)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark.circle.fill") }
                        .accessibilityLabel("Close stop")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .sheet(item: $editingWatch) { watch in CommuteWatchEditor(watch: watch) }
    }

    private var arrivals: [Arrival] { repository.arrivals(for: stop.id) }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(stop.suburb.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(settings.theme.accent)
            Text(stop.name)
                .font(.title2.weight(.bold))
            HStack {
                ForEach(stop.modes.filter { $0 != "interchange" }, id: \.self) { ModePill(mode: $0) }
                Spacer()
                Text(stop.code)
                    .font(.caption.monospaced().weight(.bold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var actionRow: some View {
        HStack(spacing: 10) {
            Button {
                settings.toggleFavorite(stop.id)
                repository.writeWidgetSnapshot(for: settings.favoriteStopIDs.sorted().first)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } label: {
                Label(settings.isFavorite(stop.id) ? "Saved" : "Save", systemImage: settings.isFavorite(stop.id) ? "star.fill" : "star")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            Button {
                editingWatch = CommuteWatch(
                    name: stop.name,
                    stopID: stop.id,
                    routeIDs: stop.routes
                )
            } label: {
                Label("Watch", systemImage: "bell.badge")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            Button {
                Task {
                    if liveActivities.activeStopID == stop.id {
                        await liveActivities.endAll()
                    } else if let arrival = arrivals.first {
                        await liveActivities.start(
                            stop: stop,
                            arrival: arrival,
                            routeDisplayName: repository.routeByID[arrival.routeId]?.shortName
                        )
                    }
                }
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            } label: {
                Label(liveActivities.activeStopID == stop.id ? "Tracking" : "Track", systemImage: "wave.3.right.circle.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(arrivals.isEmpty)
        }
    }

    private var dataStatus: some View {
        HStack {
            DataHealthBadge(health: repository.dataHealth, updatedAt: repository.lastUpdated)
            Spacer()
            if repository.dataHealth.departures != .live {
                Text("Times below use the timetable")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var arrivalsSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Next arrivals").font(.headline)
                Spacer()
                if let first = arrivals.first {
                    Label(first.source == .live ? "Live" : "Timetable", systemImage: first.source == .live ? "dot.radiowaves.left.and.right" : "clock")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(first.source == .live ? settings.theme.accent : .secondary)
                }
            }

            if arrivals.isEmpty {
                EmptyStateView(symbol: "clock.badge.questionmark", title: "No upcoming services", message: "No live or scheduled departures are available for this stop.")
                    .frame(minHeight: 180)
            } else {
                VStack(spacing: 0) {
                    ForEach(arrivals) { arrival in
                        ArrivalRow(arrival: arrival, route: repository.routeByID[arrival.routeId], theme: settings.theme)
                        if arrival.id != arrivals.last?.id { Divider() }
                    }
                }
                .padding(.horizontal, 12)
                .background(settings.theme.surface, in: RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    @ViewBuilder
    private var incidentsSection: some View {
        let incidents = repository.incidents(for: stop)
        let stalledRoutes = stop.routes.flatMap { repository.vehicleHealth(for: $0) }
        if !incidents.isEmpty || !stalledRoutes.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Service status").font(.headline)
                ForEach(incidents.prefix(3)) { incident in
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(repository.routeByID[incident.routeId]?.shortName ?? incident.routeId) to \(incident.headsign)")
                                .font(.subheadline.weight(.semibold))
                            Text(incident.detail ?? "This service is disrupted.").font(.caption).foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: incident.condition.symbol).foregroundStyle(incident.condition.color)
                    }
                    .padding(12)
                    .background(settings.theme.surface, in: RoundedRectangle(cornerRadius: 8))
                }
                ForEach(stalledRoutes.prefix(2)) { health in
                    Label("Route \(repository.routeByID[health.routeID]?.shortName ?? health.routeID) vehicle may be stalled (\(health.stationaryMinutes) min)", systemImage: "pause.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ServiceCondition.stalled.color)
                        .padding(12)
                        .background(settings.theme.surface, in: RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    @ViewBuilder
    private var alternativesSection: some View {
        if let disrupted = arrivals.first(where: { $0.condition.isCritical }) {
            let alternatives = repository.alternatives(for: stop, excluding: disrupted)
            if !alternatives.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Next best options").font(.headline)
                    ForEach(alternatives) { option in
                        HStack(spacing: 10) {
                            Image(systemName: option.walkingMinutes > 0 ? "figure.walk" : "arrow.triangle.turn.up.right.diamond.fill")
                                .foregroundStyle(settings.theme.accent)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(repository.routeByID[option.arrival.routeId]?.shortName ?? option.arrival.routeId) to \(option.arrival.headsign)")
                                    .font(.subheadline.weight(.semibold))
                                Text("From \(option.stop.name) - \(option.walkingMinutes) min walk")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(option.totalMinutes) min").font(.subheadline.monospacedDigit().weight(.bold))
                        }
                        .padding(12)
                        .background(settings.theme.surface, in: RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var alertsSection: some View {
        let alerts = repository.alerts(for: stop)
        if !alerts.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Service notices").font(.headline)
                ForEach(alerts.prefix(3)) { alert in
                    HStack(alignment: .top, spacing: 10) {
                        AlertSeverityIcon(severity: alert.severity)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(alert.title).font(.subheadline.weight(.semibold))
                            Text(alert.readableDescription).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                        }
                    }
                    .padding(12)
                    .background(settings.theme.surface, in: RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }
}
