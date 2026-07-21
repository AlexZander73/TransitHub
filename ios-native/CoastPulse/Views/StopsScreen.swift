import SwiftUI

struct StopsScreen: View {
    @EnvironmentObject private var repository: TransitRepository
    @EnvironmentObject private var settings: UserSettings
    @EnvironmentObject private var locationService: LocationService
    @EnvironmentObject private var navigation: AppNavigation
    @State private var query = ""

    var body: some View {
        NavigationStack {
            List {
                if !favoriteStops.isEmpty {
                    Section("Favourites") { ForEach(favoriteStops) { stopRow($0) } }
                }
                Section(locationService.location == nil ? "All stops" : "Nearest stops") {
                    ForEach(filteredStops) { stopRow($0) }
                }
            }
            .listStyle(.plain)
            .navigationTitle("Stops")
            .searchable(text: $query, prompt: "Stop, suburb, or code")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { locationService.requestLocation() } label: { Image(systemName: "location.fill") }
                        .accessibilityLabel("Sort by current location")
                }
            }
            .background(settings.theme.page)
        }
    }

    private var favoriteStops: [TransitStop] {
        repository.stops.filter { settings.favoriteStopIDs.contains($0.id) }
    }

    private var filteredStops: [TransitStop] {
        repository.stops(in: settings.selectedRegionID)
            .filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || $0.suburb.localizedCaseInsensitiveContains(query) || $0.code.localizedCaseInsensitiveContains(query) }
            .sorted { lhs, rhs in
                guard let location = locationService.location?.coordinate else { return lhs.name < rhs.name }
                return lhs.coordinate.distance(to: location) < rhs.coordinate.distance(to: location)
            }
    }

    private func stopRow(_ stop: TransitStop) -> some View {
        Button {
            navigation.open(stopID: stop.id)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: TransitMode(rawValue: stop.modes.first ?? "")?.symbol ?? "mappin.circle.fill")
                    .font(.title3)
                    .foregroundStyle(settings.theme.accent)
                    .frame(width: 30)
                VStack(alignment: .leading, spacing: 3) {
                    Text(stop.name).font(.body.weight(.semibold))
                    HStack(spacing: 6) {
                        Text(stop.suburb)
                        if let distance = repository.distance(to: stop, from: locationService.location?.coordinate) {
                            Text(Measurement(value: distance, unit: UnitLength.meters).formatted(.measurement(width: .abbreviated, usage: .road)))
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                Spacer()
                if settings.isFavorite(stop.id) { Image(systemName: "star.fill").foregroundStyle(settings.theme.secondaryAccent) }
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
