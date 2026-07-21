import SwiftUI

struct AlertsScreen: View {
    @EnvironmentObject private var repository: TransitRepository
    @EnvironmentObject private var settings: UserSettings

    var body: some View {
        NavigationStack {
            Group {
                if alerts.isEmpty {
                    EmptyStateView(symbol: "checkmark.seal.fill", title: "No current disruptions", message: "There are no active notices for this region.")
                } else {
                    List(alerts) { alert in
                        HStack(alignment: .top, spacing: 12) {
                            AlertSeverityIcon(severity: alert.severity)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(alert.title).font(.headline)
                                Text(alert.readableDescription).font(.subheadline).foregroundStyle(.secondary).lineLimit(4)
                                if !alert.routes.isEmpty {
                                    Text("Routes \(alert.routes.joined(separator: ", "))")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(settings.theme.accent)
                                }
                            }
                        }
                        .padding(.vertical, 5)
                    }
                    .listStyle(.plain)
                    .refreshable { await repository.refreshLiveData() }
                }
            }
            .navigationTitle("Alerts")
            .background(settings.theme.page)
        }
    }

    private var alerts: [TransitAlert] { repository.activeAlerts(in: settings.selectedRegionID) }
}
