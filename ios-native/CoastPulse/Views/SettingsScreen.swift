import StoreKit
import SwiftUI
import UIKit
import UserNotifications

struct SettingsScreen: View {
    @EnvironmentObject private var repository: TransitRepository
    @EnvironmentObject private var settings: UserSettings
    @EnvironmentObject private var store: StoreKitService
    @EnvironmentObject private var liveActivities: LiveActivityManager
    @EnvironmentObject private var commuteNotifications: CommuteNotificationService
    @State private var showPremium = false
    @State private var iconError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    brandHeader
                    themeSection
                    iconSection
                    notificationSection
                    tipJarSection
                    dataSection
                }
                .padding(18)
            }
            .background(settings.theme.page)
            .navigationTitle("CoastPulse")
            .navigationBarTitleDisplayMode(.inline)
        }
        .sheet(isPresented: $showPremium) { PremiumSheet() }
        .alert("App icon", isPresented: Binding(get: { iconError != nil }, set: { if !$0 { iconError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(iconError ?? "") }
    }

    private var brandHeader: some View {
        HStack(spacing: 14) {
            Image(settings.theme.iconAssetName)
                .resizable()
                .scaledToFit()
                .frame(width: 68, height: 68)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 4) {
                Text("CoastPulse").font(.title2.weight(.bold))
                Text("Transit around you, without the clutter.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var themeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            settingHeader("Themes", symbol: "paintpalette.fill")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(TransitTheme.allCases) { theme in
                    Button {
                        if theme.isPremium && !store.isPremium {
                            showPremium = true
                        } else {
                            settings.theme = theme
                        }
                    } label: {
                        ThemeOption(theme: theme, selected: settings.theme == theme, locked: theme.isPremium && !store.isPremium)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var iconSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            settingHeader("App icon", symbol: "app.badge.fill")
            HStack(spacing: 14) {
                iconButton(asset: "ThemeOriginal", title: "Original", iconName: nil, premium: false)
                iconButton(asset: "ThemeAurora", title: "Aurora", iconName: "AppIconAurora", premium: true)
                iconButton(asset: "ThemeTransitMotion", title: "Motion", iconName: "AppIconTransitMotion", premium: true)
                iconButton(asset: "ThemeCoastlineExplorer", title: "Coastline", iconName: "AppIconCoastlineExplorer", premium: true)
            }
        }
    }

    private var notificationSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            settingHeader("Travel alerts", symbol: "bell.badge.fill")
            Toggle(isOn: notificationBinding) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Commute and service alerts").font(.body.weight(.semibold))
                    Text("Delay, cancellation, skipped-stop, stalled-vehicle, and time-to-leave alerts.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(12)
            .background(settings.theme.surface, in: RoundedRectangle(cornerRadius: 8))

            if liveActivities.activeStopID != nil {
                Button(role: .destructive) { Task { await liveActivities.endAll() } } label: {
                    Label("End current Live Activity", systemImage: "wave.3.right.circle")
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private var tipJarSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            settingHeader("Tip jar", symbol: "heart.fill")
            Text("CoastPulse is free to use. Tips support live-data hosting, testing, and continued accessibility work.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if store.tipProducts.isEmpty {
                Text("Tip products become available through the App Store at release.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                HStack {
                    ForEach(store.tipProducts, id: \.id) { product in
                        Button(product.displayPrice) { Task { await store.purchase(product) } }
                            .buttonStyle(.bordered)
                    }
                }
            }
        }
        .padding(14)
        .background(settings.theme.surface, in: RoundedRectangle(cornerRadius: 8))
    }

    private var dataSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            settingHeader("Network data", symbol: "externaldrive.connected.to.line.below.fill")
            LabeledContent("Source", value: "Translink GTFS + GTFS-RT")
            LabeledContent("Last snapshot", value: repository.lastUpdated?.formatted(date: .abbreviated, time: .shortened) ?? "Bundled offline data")
            LabeledContent("Departures", value: repository.dataHealth.departures.rawValue.capitalized)
            LabeledContent("Vehicles", value: repository.dataHealth.vehicles.rawValue.capitalized)
            Link(destination: URL(string: "https://translink.com.au/about-translink/open-data/gtfs-rt")!) {
                Label("Official open-data information", systemImage: "arrow.up.right.square")
            }
            Text("Unofficial and not affiliated with Translink or the Queensland Government. Verify critical journeys through official channels.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func settingHeader(_ title: String, symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(.headline)
            .foregroundStyle(settings.theme.primaryText)
    }

    private func iconButton(asset: String, title: String, iconName: String?, premium: Bool) -> some View {
        let selected = settings.alternateIconName == iconName
        return Button {
            guard !premium || store.isPremium else { showPremium = true; return }
            Task {
                do {
                    try await UIApplication.shared.setAlternateIconName(iconName)
                    settings.alternateIconName = iconName
                } catch {
                    iconError = error.localizedDescription
                }
            }
        } label: {
            VStack(spacing: 6) {
                Image(asset)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 54, height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? settings.theme.accent : .clear, lineWidth: 3))
                Text(title).font(.caption2).lineLimit(1)
                if premium && !store.isPremium { Image(systemName: "lock.fill").font(.caption2) }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private var notificationBinding: Binding<Bool> {
        Binding(
            get: { settings.notificationsEnabled },
            set: { enabled in
                if !enabled {
                    settings.notificationsEnabled = false
                    UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
                    return
                }
                Task {
                    settings.notificationsEnabled = await commuteNotifications.requestAuthorization()
                }
            }
        )
    }
}

private struct ThemeOption: View {
    let theme: TransitTheme
    let selected: Bool
    let locked: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Circle().fill(theme.page).frame(width: 20, height: 20)
                Circle().fill(theme.accent).frame(width: 20, height: 20)
                Circle().fill(theme.secondaryAccent).frame(width: 20, height: 20)
                Spacer()
                Image(systemName: locked ? "lock.fill" : selected ? "checkmark.circle.fill" : "circle")
            }
            Text(theme.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.primaryText)
                .lineLimit(1)
        }
        .padding(12)
        .background(theme.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? theme.accent : Color.secondary.opacity(0.2), lineWidth: selected ? 2 : 1))
    }
}

private struct PremiumSheet: View {
    @EnvironmentObject private var store: StoreKitService
    @EnvironmentObject private var settings: UserSettings
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Image(systemName: "sparkles.square.filled.on.square")
                        .font(.system(size: 44))
                        .foregroundStyle(settings.theme.accent)
                    Text("Premium appearance")
                        .font(.largeTitle.weight(.bold))
                    Text("Unlock every premium map treatment and all alternate app icons with one purchase.")
                        .font(.title3)
                        .foregroundStyle(.secondary)

                    ForEach(TransitTheme.allCases.filter(\.isPremium)) { theme in
                        HStack {
                            Image(theme.iconAssetName)
                                .resizable().scaledToFit().frame(width: 44, height: 44)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            Text(theme.name).font(.headline)
                            Spacer()
                            Image(systemName: "checkmark")
                        }
                    }

                    if store.isPremium {
                        Label("Premium unlocked", systemImage: "checkmark.seal.fill")
                            .font(.headline)
                            .foregroundStyle(.green)
                    } else if let product = store.premiumProduct {
                        Button { Task { await store.purchase(product) } } label: {
                            Text("Unlock for \(product.displayPrice)").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                    } else {
                        ProgressView("Connecting to the App Store")
                    }

                    Button("Restore purchases") { Task { await store.restore() } }
                        .frame(maxWidth: .infinity)
                }
                .padding(20)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
    }
}
