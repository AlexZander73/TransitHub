import SwiftUI
import WidgetKit

@main
struct CoastPulseWidgetsBundle: WidgetBundle {
    var body: some Widget {
        NextDepartureWidget()
        ServiceStatusWidget()
        TransitLiveActivityWidget()
    }
}

struct TransitWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetTransitSnapshot
}

struct TransitWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> TransitWidgetEntry {
        .init(date: .now, snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (TransitWidgetEntry) -> Void) {
        completion(.init(date: .now, snapshot: AppGroupStore.readSnapshot() ?? .placeholder))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TransitWidgetEntry>) -> Void) {
        let snapshot = AppGroupStore.readSnapshot() ?? .placeholder
        completion(Timeline(entries: [.init(date: .now, snapshot: snapshot)], policy: .after(.now.addingTimeInterval(15 * 60))))
    }
}
