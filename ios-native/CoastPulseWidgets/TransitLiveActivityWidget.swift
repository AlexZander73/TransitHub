import ActivityKit
import SwiftUI
import WidgetKit

struct TransitLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TransitActivityAttributes.self) { context in
            HStack(spacing: 12) {
                Image(systemName: "wave.3.right.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Color(hex: "20C7D6"))
                VStack(alignment: .leading, spacing: 3) {
                    Text(context.attributes.stopName).font(.headline).lineLimit(1)
                    Text("\(context.state.routeID) to \(context.state.headsign)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    if condition(context).isCritical {
                        Text(statusText(context)).font(.headline).foregroundStyle(statusColor(context))
                    } else {
                        Text(context.state.departure, style: .timer)
                            .font(.headline.monospacedDigit())
                            .foregroundStyle(statusColor(context))
                    }
                    if context.state.delayMinutes > 0 {
                        Text("\(context.state.delayMinutes) min late").font(.caption2).foregroundStyle(statusColor(context))
                    }
                }
            }
            .padding(.horizontal)
            .activityBackgroundTint(Color(hex: "F5FBFF"))
            .activitySystemActionForegroundColor(Color(hex: "071B2E"))
            .widgetURL(URL(string: "coastpulse://stop/\(context.attributes.stopID)"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.routeID)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(Color(hex: "7DE1D7"))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if condition(context).isCritical {
                        Image(systemName: statusSymbol(context)).foregroundStyle(statusColor(context))
                    } else {
                        Text(context.state.departure, style: .timer).font(.headline.monospacedDigit())
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.stopName).font(.subheadline.weight(.semibold)).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Image(systemName: context.state.isLive ? "dot.radiowaves.left.and.right" : "clock")
                        Text(context.state.headsign).lineLimit(1)
                        Spacer()
                        Text(statusText(context))
                    }
                    .font(.caption)
                }
            } compactLeading: {
                Text(context.state.routeID).font(.caption.weight(.heavy)).foregroundStyle(Color(hex: "7DE1D7"))
            } compactTrailing: {
                if condition(context).isCritical {
                    Image(systemName: statusSymbol(context)).foregroundStyle(statusColor(context))
                } else {
                    Text(context.state.departure, style: .timer).font(.caption.monospacedDigit())
                }
            } minimal: {
                Image(systemName: "tram.fill").foregroundStyle(Color(hex: "20C7D6"))
            }
            .widgetURL(URL(string: "coastpulse://stop/\(context.attributes.stopID)"))
            .keylineTint(Color(hex: "20C7D6"))
        }
    }

    private func condition(_ context: ActivityViewContext<TransitActivityAttributes>) -> ServiceCondition {
        ServiceCondition(status: context.state.status, delayMinutes: context.state.delayMinutes)
    }

    private func statusText(_ context: ActivityViewContext<TransitActivityAttributes>) -> String {
        switch condition(context) {
        case .onTime: context.state.isLive ? "On time" : "Timetable"
        case .early: "Early"
        case .delayed, .severelyDelayed: "\(context.state.delayMinutes) min late"
        case .cancelled: "Cancelled"
        case .skipped: "Not stopping"
        case .noData, .trackingUnavailable: "Tracking unavailable"
        case .stalled: "May be stalled"
        case .replaced: "Replacement"
        case .endingEarly: "Ending early"
        }
    }

    private func statusSymbol(_ context: ActivityViewContext<TransitActivityAttributes>) -> String {
        switch condition(context) {
        case .cancelled: "xmark.octagon.fill"
        case .skipped: "arrow.right.circle.fill"
        case .stalled: "pause.circle.fill"
        case .severelyDelayed: "exclamationmark.triangle.fill"
        default: "clock.badge.exclamationmark.fill"
        }
    }

    private func statusColor(_ context: ActivityViewContext<TransitActivityAttributes>) -> Color {
        switch condition(context) {
        case .onTime: Color(hex: "087F8C")
        case .early: .blue
        case .delayed: .orange
        case .severelyDelayed, .cancelled, .skipped, .endingEarly: .red
        case .stalled: .purple
        default: .secondary
        }
    }
}
