import CoreLocation
import Foundation
import SwiftUI

enum FlexibleDate {
    private static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let standard = ISO8601DateFormatter()

    static func parse(_ value: String) -> Date? {
        fractional.date(from: value) ?? standard.date(from: value)
    }
}

extension Color {
    init(hex: String) {
        let value = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var number: UInt64 = 0
        Scanner(string: value).scanHexInt64(&number)
        let red, green, blue, alpha: UInt64
        switch value.count {
        case 8:
            red = number >> 24
            green = number >> 16 & 0xff
            blue = number >> 8 & 0xff
            alpha = number & 0xff
        default:
            red = number >> 16
            green = number >> 8 & 0xff
            blue = number & 0xff
            alpha = 0xff
        }
        self.init(
            .sRGB,
            red: Double(red) / 255,
            green: Double(green) / 255,
            blue: Double(blue) / 255,
            opacity: Double(alpha) / 255
        )
    }
}

extension CLLocationCoordinate2D {
    func distance(to other: CLLocationCoordinate2D) -> CLLocationDistance {
        CLLocation(latitude: latitude, longitude: longitude)
            .distance(from: CLLocation(latitude: other.latitude, longitude: other.longitude))
    }
}

extension Date {
    var shortTransitTime: String {
        formatted(date: .omitted, time: .shortened)
    }
}

enum TransitMode: String, CaseIterable {
    case tram, bus, train, ferry, interchange

    var symbol: String {
        switch self {
        case .tram: "tram.fill"
        case .bus: "bus.fill"
        case .train: "train.side.front.car"
        case .ferry: "ferry.fill"
        case .interchange: "arrow.triangle.swap"
        }
    }
}
