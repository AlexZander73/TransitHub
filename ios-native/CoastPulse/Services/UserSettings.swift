import Foundation

@MainActor
final class UserSettings: ObservableObject {
    @Published var theme: TransitTheme { didSet { defaults.set(theme.rawValue, forKey: Key.theme) } }
    @Published var selectedRegionID: String { didSet { defaults.set(selectedRegionID, forKey: Key.region) } }
    @Published var favoriteStopIDs: Set<String> { didSet { persistFavorites() } }
    @Published var alternateIconName: String? { didSet { defaults.set(alternateIconName, forKey: Key.icon) } }
    @Published var notificationsEnabled: Bool { didSet { persistNotifications() } }
    @Published var commuteWatches: [CommuteWatch] { didSet { persistCommuteWatches() } }

    private let defaults = UserDefaults.standard

    private enum Key {
        static let theme = "selectedTheme"
        static let region = "selectedRegion"
        static let favorites = "favoriteStopIDs"
        static let icon = "alternateIconName"
        static let notifications = "notificationsEnabled"
        static let commuteWatches = "commuteWatches"
    }

    init() {
        theme = TransitTheme(rawValue: defaults.string(forKey: Key.theme) ?? "") ?? .coastPulse
        selectedRegionID = defaults.string(forKey: Key.region) ?? "gold-coast"
        favoriteStopIDs = Set(defaults.stringArray(forKey: Key.favorites) ?? [])
        alternateIconName = defaults.string(forKey: Key.icon)
        notificationsEnabled = defaults.bool(forKey: Key.notifications)
        let storedWatches = defaults.data(forKey: Key.commuteWatches)
            ?? AppGroupStore.defaults.data(forKey: AppGroupStore.Key.commuteWatches)
        commuteWatches = storedWatches.flatMap { try? JSONDecoder().decode([CommuteWatch].self, from: $0) } ?? []
    }

    func toggleFavorite(_ stopID: String) {
        if favoriteStopIDs.contains(stopID) {
            favoriteStopIDs.remove(stopID)
        } else {
            favoriteStopIDs.insert(stopID)
        }
    }

    func isFavorite(_ stopID: String) -> Bool { favoriteStopIDs.contains(stopID) }

    func saveCommuteWatch(_ watch: CommuteWatch) {
        if let index = commuteWatches.firstIndex(where: { $0.id == watch.id }) {
            commuteWatches[index] = watch
        } else {
            commuteWatches.append(watch)
        }
    }

    func removeCommuteWatches(at offsets: IndexSet) {
        for index in offsets.sorted(by: >) where commuteWatches.indices.contains(index) {
            commuteWatches.remove(at: index)
        }
    }

    private func persistFavorites() {
        let values = favoriteStopIDs.sorted()
        defaults.set(values, forKey: Key.favorites)
        AppGroupStore.defaults.set(values, forKey: AppGroupStore.Key.favoriteStopIDs)
    }

    private func persistNotifications() {
        defaults.set(notificationsEnabled, forKey: Key.notifications)
        AppGroupStore.defaults.set(notificationsEnabled, forKey: AppGroupStore.Key.notificationsEnabled)
    }

    private func persistCommuteWatches() {
        guard let data = try? JSONEncoder().encode(commuteWatches) else { return }
        defaults.set(data, forKey: Key.commuteWatches)
        AppGroupStore.defaults.set(data, forKey: AppGroupStore.Key.commuteWatches)
    }
}
