import SwiftUI

@main
struct CoastPulseApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var repository = TransitRepository()
    @StateObject private var settings = UserSettings()
    @StateObject private var locationService = LocationService()
    @StateObject private var store = StoreKitService()
    @StateObject private var liveActivities = LiveActivityManager()
    @StateObject private var commuteNotifications = CommuteNotificationService()
    @StateObject private var navigation = AppNavigation()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(repository)
                .environmentObject(settings)
                .environmentObject(locationService)
                .environmentObject(store)
                .environmentObject(liveActivities)
                .environmentObject(commuteNotifications)
                .environmentObject(navigation)
                .preferredColorScheme(settings.theme.preferredColorScheme)
                .tint(settings.theme.accent)
        }
        .backgroundTask(.appRefresh(BackgroundRefresh.identifier)) {
            _ = await BackgroundRefreshWorker().run()
            BackgroundRefresh.schedule()
        }
    }
}
