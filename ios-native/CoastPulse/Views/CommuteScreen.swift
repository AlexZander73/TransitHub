import CoreLocation
import SwiftUI

struct CommuteScreen: View {
    @EnvironmentObject private var repository: TransitRepository
    @EnvironmentObject private var settings: UserSettings
    @EnvironmentObject private var locationService: LocationService
    @EnvironmentObject private var navigation: AppNavigation
    @State private var editingWatch: CommuteWatch?

    var body: some View {
        NavigationStack {
            Group {
                if settings.commuteWatches.isEmpty {
                    EmptyStateView(
                        symbol: "clock.badge.checkmark",
                        title: "Watch your regular trip",
                        message: "Get a useful heads-up for delays, cancellations, skipped stops, and the right time to leave."
                    )
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            statusHeader
                            ForEach(settings.commuteWatches) { watch in
                                CommuteWatchCard(watch: watch, onEdit: { editingWatch = watch })
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .background(settings.theme.page)
            .navigationTitle("Commute")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { locationService.requestLocation() } label: { Image(systemName: "location.fill") }
                        .accessibilityLabel("Update walking time")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { editingWatch = newWatch() } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add commute watch")
                }
            }
        }
        .sheet(item: $editingWatch) { watch in
            CommuteWatchEditor(watch: watch)
        }
    }

    private var statusHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("Your day at a glance").font(.headline)
                Text("Checks live conditions about every 15 minutes")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            DataHealthBadge(health: repository.dataHealth, updatedAt: repository.lastUpdated)
        }
        .padding(.bottom, 2)
    }

    private func newWatch() -> CommuteWatch {
        let stop = locationService.location.flatMap {
            repository.nearestStop(to: $0.coordinate, in: settings.selectedRegionID)
        } ?? settings.favoriteStopIDs.compactMap { repository.stopByID[$0] }.first
            ?? repository.stops(in: settings.selectedRegionID).first
        return CommuteWatch(stopID: stop?.id ?? "", routeIDs: stop?.routes ?? [])
    }
}

private struct CommuteWatchCard: View {
    let watch: CommuteWatch
    let onEdit: () -> Void

    @EnvironmentObject private var repository: TransitRepository
    @EnvironmentObject private var settings: UserSettings
    @EnvironmentObject private var locationService: LocationService
    @EnvironmentObject private var navigation: AppNavigation

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 10) {
                Image(systemName: condition.symbol)
                    .foregroundStyle(condition.color)
                    .font(.title2)
                    .frame(width: 34, height: 34)
                    .background(condition.color.opacity(0.12), in: RoundedRectangle(cornerRadius: 7))
                VStack(alignment: .leading, spacing: 2) {
                    Text(watch.name).font(.headline)
                    Text(stop?.name ?? "Choose a stop").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Toggle("Enabled", isOn: enabledBinding).labelsHidden()
                Button(action: onEdit) { Image(systemName: "slider.horizontal.3") }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Edit \(watch.name)")
            }

            if let arrival {
                HStack(alignment: .firstTextBaseline) {
                    RouteBadge(routeID: arrival.routeId, route: repository.routeByID[arrival.routeId])
                    VStack(alignment: .leading, spacing: 2) {
                        Text(arrival.headsign).font(.subheadline.weight(.semibold)).lineLimit(1)
                        Text(arrival.statusText).font(.caption.weight(.semibold)).foregroundStyle(condition.color)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(arrival.isBoardable ? (arrival.minutesAway == 0 ? "Due" : "\(arrival.minutesAway) min") : arrival.departure.shortTransitTime)
                            .font(.title3.monospacedDigit().weight(.bold))
                        Text(leaveText).font(.caption).foregroundStyle(.secondary)
                    }
                }
            } else {
                Text(watch.enabled ? "No matching service in the next few hours." : "This commute watch is paused.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if condition.isCritical, stop != nil, !alternatives.isEmpty {
                Divider()
                Text("Next best options").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                ForEach(alternatives.prefix(2)) { option in
                    HStack {
                        Image(systemName: option.walkingMinutes > 0 ? "figure.walk" : "arrow.triangle.turn.up.right.diamond.fill")
                            .foregroundStyle(settings.theme.accent)
                        Text("\(repository.routeByID[option.arrival.routeId]?.shortName ?? option.arrival.routeId) from \(option.stop.name)")
                            .font(.caption).lineLimit(1)
                        Spacer()
                        Text("\(option.totalMinutes) min").font(.caption.monospacedDigit().weight(.semibold))
                    }
                }
            }

            if let stop {
                Button {
                    navigation.open(stopID: stop.id)
                } label: {
                    Label("View stop", systemImage: "arrow.up.right.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(14)
        .background(settings.theme.surface, in: RoundedRectangle(cornerRadius: 8))
        .opacity(watch.enabled ? 1 : 0.66)
    }

    private var stop: TransitStop? { repository.stopByID[watch.stopID] }
    private var arrival: Arrival? {
        repository.arrivals(for: watch.stopID, limit: 12)
            .first { watch.matches(routeID: $0.routeId, headsign: $0.headsign) }
    }
    private var condition: ServiceCondition { arrival?.condition ?? .noData }
    private var walkingMinutes: Int {
        guard let stop, let location = locationService.location else { return 0 }
        return Int(ceil(location.distance(from: CLLocation(latitude: stop.lat, longitude: stop.lon)) / 78.0))
    }
    private var leaveText: String {
        guard let arrival else { return "" }
        let minutes = max(0, arrival.minutesAway - walkingMinutes)
        return walkingMinutes > 0 ? (minutes == 0 ? "Leave now" : "Leave in \(minutes) min") : arrival.departure.shortTransitTime
    }
    private var alternatives: [AlternativeService] {
        guard let stop else { return [] }
        return repository.alternatives(for: stop, excluding: arrival, userCoordinate: locationService.location?.coordinate)
    }
    private var enabledBinding: Binding<Bool> {
        Binding(
            get: { watch.enabled },
            set: { value in
                var updated = watch
                updated.enabled = value
                settings.saveCommuteWatch(updated)
            }
        )
    }
}

struct CommuteWatchEditor: View {
    @EnvironmentObject private var repository: TransitRepository
    @EnvironmentObject private var settings: UserSettings
    @EnvironmentObject private var notifications: CommuteNotificationService
    @Environment(\.dismiss) private var dismiss
    @State private var draft: CommuteWatch

    init(watch: CommuteWatch) { _draft = State(initialValue: watch) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Commute") {
                    TextField("Name", text: $draft.name)
                    NavigationLink {
                        CommuteStopPicker(selectedStopID: $draft.stopID)
                    } label: {
                        LabeledContent("Stop", value: repository.stopByID[draft.stopID]?.name ?? "Choose")
                    }
                }

                Section("Routes") {
                    if availableRoutes.isEmpty {
                        Text("Choose a stop to select routes.").foregroundStyle(.secondary)
                    } else {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(availableRoutes) { route in
                                    Button {
                                        if draft.routeIDs.contains(route.id) {
                                            draft.routeIDs.removeAll { $0 == route.id }
                                        } else {
                                            draft.routeIDs.append(route.id)
                                        }
                                    } label: {
                                        Label(route.shortName, systemImage: TransitMode(rawValue: route.mode)?.symbol ?? "arrow.triangle.swap")
                                            .padding(.horizontal, 10).padding(.vertical, 8)
                                            .foregroundStyle(draft.routeIDs.contains(route.id) ? .white : settings.theme.primaryText)
                                            .background(draft.routeIDs.contains(route.id) ? settings.theme.accent : settings.theme.page, in: RoundedRectangle(cornerRadius: 7))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }

                Section("When") {
                    HStack {
                        ForEach(weekdayOptions, id: \.0) { day, label in
                            Button {
                                if draft.weekdays.contains(day) { draft.weekdays.removeAll { $0 == day } }
                                else { draft.weekdays.append(day) }
                            } label: {
                                Text(label)
                                    .font(.caption.weight(.bold))
                                    .frame(maxWidth: .infinity, minHeight: 32)
                                    .foregroundStyle(draft.weekdays.contains(day) ? .white : .primary)
                                    .background(draft.weekdays.contains(day) ? settings.theme.accent : Color.secondary.opacity(0.12), in: Circle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    DatePicker("From", selection: minuteBinding(\.startMinute), displayedComponents: .hourAndMinute)
                    DatePicker("Until", selection: minuteBinding(\.endMinute), displayedComponents: .hourAndMinute)
                    Stepper("Alert at \(draft.delayThreshold)+ min delay", value: $draft.delayThreshold, in: 2...30)
                    Stepper("Leave reminder \(draft.departureLeadMinutes) min before", value: $draft.departureLeadMinutes, in: 2...30)
                }

                Section("Notify me") {
                    Toggle("Delays", systemImage: "clock.badge.exclamationmark", isOn: $draft.notifyDelay)
                    Toggle("Cancellations", systemImage: "xmark.octagon.fill", isOn: $draft.notifyCancellation)
                    Toggle("Skipped stop", systemImage: "arrow.right.circle.fill", isOn: $draft.notifySkippedStop)
                    Toggle("Official service notices", systemImage: "exclamationmark.triangle.fill", isOn: $draft.notifyServiceAlerts)
                    Toggle("Vehicle may be stalled", systemImage: "pause.circle.fill", isOn: $draft.notifyStalledVehicle)
                }

                if settings.commuteWatches.contains(where: { $0.id == draft.id }) {
                    Section {
                        Button("Delete commute", role: .destructive) {
                            settings.commuteWatches.removeAll { $0.id == draft.id }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle("Commute watch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(draft.stopID.isEmpty || draft.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onChange(of: draft.stopID) { _, _ in
                draft.routeIDs = draft.routeIDs.filter { availableRoutes.map(\.id).contains($0) }
            }
        }
    }

    private var availableRoutes: [TransitRoute] {
        let ids = Set(repository.stopByID[draft.stopID]?.routes ?? [])
        return repository.routes.filter { ids.contains($0.id) }
    }
    private var weekdayOptions: [(Int, String)] { [(2, "M"), (3, "T"), (4, "W"), (5, "T"), (6, "F"), (7, "S"), (1, "S")] }

    private func minuteBinding(_ keyPath: WritableKeyPath<CommuteWatch, Int>) -> Binding<Date> {
        Binding(
            get: {
                let minute = draft[keyPath: keyPath]
                return Calendar.brisbane.date(bySettingHour: minute / 60, minute: minute % 60, second: 0, of: .now) ?? .now
            },
            set: { date in
                draft[keyPath: keyPath] = Calendar.brisbane.component(.hour, from: date) * 60
                    + Calendar.brisbane.component(.minute, from: date)
            }
        )
    }

    private func save() {
        draft.name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        settings.saveCommuteWatch(draft)
        Task {
            if !settings.notificationsEnabled {
                settings.notificationsEnabled = await notifications.requestAuthorization()
            }
        }
        dismiss()
    }
}

private struct CommuteStopPicker: View {
    @EnvironmentObject private var repository: TransitRepository
    @EnvironmentObject private var settings: UserSettings
    @Environment(\.dismiss) private var dismiss
    @Binding var selectedStopID: String
    @State private var query = ""

    var body: some View {
        List(filteredStops) { stop in
            Button {
                selectedStopID = stop.id
                dismiss()
            } label: {
                HStack {
                    Image(systemName: TransitMode(rawValue: stop.modes.first ?? "")?.symbol ?? "mappin")
                        .foregroundStyle(settings.theme.accent).frame(width: 28)
                    VStack(alignment: .leading) {
                        Text(stop.name).foregroundStyle(.primary)
                        Text(stop.suburb).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if selectedStopID == stop.id { Image(systemName: "checkmark.circle.fill").foregroundStyle(settings.theme.accent) }
                }
            }
        }
        .searchable(text: $query, prompt: "Stop, suburb, or code")
        .navigationTitle("Choose stop")
    }

    private var filteredStops: [TransitStop] {
        repository.stops(in: settings.selectedRegionID).filter {
            query.isEmpty || $0.name.localizedCaseInsensitiveContains(query)
                || $0.suburb.localizedCaseInsensitiveContains(query)
                || $0.code.localizedCaseInsensitiveContains(query)
        }
    }
}
