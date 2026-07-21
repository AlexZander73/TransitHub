import SwiftUI
import WidgetKit

enum AppTab: Hashable { case map, commute, stops, alerts, settings }

@MainActor
final class AppNavigation: ObservableObject {
    @Published var selectedTab: AppTab = .map
    @Published var selectedStopID: String?

    init(arguments: [String] = ProcessInfo.processInfo.arguments) {
        if let value = Self.value(after: "-CoastPulseTab", in: arguments) {
            selectedTab = switch value {
            case "commute": .commute
            case "stops": .stops
            case "alerts": .alerts
            case "settings", "more": .settings
            default: .map
            }
        }
        selectedStopID = Self.value(after: "-CoastPulseStop", in: arguments)
    }

    func open(stopID: String) {
        selectedTab = .map
        selectedStopID = stopID
    }

    private static func value(after flag: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }
}

struct RootView: View {
    @EnvironmentObject private var repository: TransitRepository
    @EnvironmentObject private var settings: UserSettings
    @EnvironmentObject private var store: StoreKitService
    @EnvironmentObject private var liveActivities: LiveActivityManager
    @EnvironmentObject private var navigation: AppNavigation
    @EnvironmentObject private var locationService: LocationService
    @EnvironmentObject private var commuteNotifications: CommuteNotificationService
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            TabView(selection: $navigation.selectedTab) {
                MapScreen()
                    .tag(AppTab.map)
                    .tabItem { Label("Map", systemImage: "map.fill") }

                CommuteScreen()
                    .tag(AppTab.commute)
                    .tabItem { Label("Commute", systemImage: "clock.badge.checkmark.fill") }

                StopsScreen()
                    .tag(AppTab.stops)
                    .tabItem { Label("Stops", systemImage: "signpost.right.and.left.fill") }

                AlertsScreen()
                    .tag(AppTab.alerts)
                    .tabItem { Label("Alerts", systemImage: "exclamationmark.triangle.fill") }
                    .badge(min(repository.activeAlerts(in: settings.selectedRegionID).count, 9))

                SettingsScreen()
                    .tag(AppTab.settings)
                    .tabItem { Label("More", systemImage: "ellipsis.circle.fill") }
            }
            .toolbarBackground(settings.theme.surface.opacity(0.92), for: .tabBar)
            .toolbarBackground(.visible, for: .tabBar)

            if repository.isLoading && repository.stops.isEmpty {
                ProgressView("Loading the network")
                    .padding(18)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .background(settings.theme.page.ignoresSafeArea())
        .sheet(item: selectedStopBinding) { stop in
            StopSheet(stop: stop)
        }
        .task {
            await repository.bootstrap()
            configureDebugState()
            await store.load()
            await commuteNotifications.configure()
            await configureLaunchState()
            syncSharedState()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15 * 60))
                guard scenePhase == .active else { continue }
                await repository.refreshLiveData()
                syncSharedState()
            }
        }
        .onChange(of: settings.favoriteStopIDs) { _, _ in syncSharedState() }
        .onChange(of: settings.commuteWatches) { _, _ in syncSharedState() }
        .onChange(of: repository.lastUpdated) { _, _ in syncSharedState() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { BackgroundRefresh.schedule() }
        }
        .onOpenURL { url in
            guard url.scheme == "coastpulse" else { return }
            switch url.host {
            case "stop" where url.pathComponents.count > 1:
                let stopID = url.pathComponents[1]
                navigation.open(stopID: stopID)
            case "stops":
                navigation.selectedTab = .stops
            case "commute":
                navigation.selectedTab = .commute
            case "alerts":
                navigation.selectedTab = .alerts
            case "settings", "more":
                navigation.selectedTab = .settings
            default:
                navigation.selectedTab = .map
            }
        }
    }

    private var selectedStopBinding: Binding<TransitStop?> {
        Binding(
            get: { navigation.selectedStopID.flatMap { repository.stopByID[$0] } },
            set: { if $0 == nil { navigation.selectedStopID = nil } }
        )
    }

    private func syncSharedState() {
        let favorite = settings.favoriteStopIDs.sorted().first
        repository.writeWidgetSnapshot(for: favorite)
        WidgetCenter.shared.reloadAllTimelines()
        if let stopID = liveActivities.activeStopID {
            let arrival = repository.arrivals(for: stopID).first
            Task {
                await liveActivities.update(
                    stopID: stopID,
                    arrival: arrival,
                    routeDisplayName: arrival.flatMap { repository.routeByID[$0.routeId]?.shortName }
                )
            }
        }
        Task {
            await commuteNotifications.evaluate(
                watches: settings.commuteWatches,
                repository: repository,
                userLocation: locationService.location
            )
        }
    }

    private func configureLaunchState(arguments: [String] = ProcessInfo.processInfo.arguments) async {
        guard arguments.contains("-CoastPulseStartLiveActivity"),
              let stopID = navigation.selectedStopID,
              let stop = repository.stopByID[stopID],
              let arrival = repository.arrivals(for: stopID).first
        else { return }
        await liveActivities.start(
            stop: stop,
            arrival: arrival,
            routeDisplayName: repository.routeByID[arrival.routeId]?.shortName
        )
    }

    private func configureDebugState(arguments: [String] = ProcessInfo.processInfo.arguments) {
        #if DEBUG
        guard arguments.contains("-CoastPulseSeedCommute"), settings.commuteWatches.isEmpty else { return }
        let stop = repository.stopByID["BBS"] ?? repository.stops(in: settings.selectedRegionID).first
        guard let stop else { return }
        settings.commuteWatches = [
            CommuteWatch(
                name: "Morning commute",
                stopID: stop.id,
                routeIDs: stop.routes,
                weekdays: [1, 2, 3, 4, 5, 6, 7],
                startMinute: 0,
                endMinute: 23 * 60 + 59
            )
        ]
        #endif
    }
}
