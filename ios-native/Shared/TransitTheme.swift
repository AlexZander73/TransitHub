import SwiftUI

enum TransitTheme: String, CaseIterable, Identifiable, Codable {
    case coastPulse
    case midnightSignal
    case aurora
    case transitMotion
    case coastlineExplorer

    var id: String { rawValue }
    var isPremium: Bool { self != .coastPulse }

    var name: String {
        switch self {
        case .coastPulse: "CoastPulse"
        case .midnightSignal: "Midnight Signal"
        case .aurora: "Aurora"
        case .transitMotion: "Transit Motion"
        case .coastlineExplorer: "Coastline Explorer"
        }
    }

    var iconAssetName: String {
        switch self {
        case .coastPulse, .midnightSignal: "ThemeOriginal"
        case .aurora: "ThemeAurora"
        case .transitMotion: "ThemeTransitMotion"
        case .coastlineExplorer: "ThemeCoastlineExplorer"
        }
    }

    var preferredColorScheme: ColorScheme? {
        switch self {
        case .aurora, .midnightSignal: .dark
        case .coastPulse, .transitMotion, .coastlineExplorer: .light
        }
    }

    var accent: Color {
        switch self {
        case .coastPulse: Color(hex: "087F8C")
        case .midnightSignal: Color(hex: "08A9B7")
        case .aurora: Color(hex: "8B5CFF")
        case .transitMotion: Color(hex: "EF4B45")
        case .coastlineExplorer: Color(hex: "0C8995")
        }
    }

    var secondaryAccent: Color {
        switch self {
        case .coastPulse: Color(hex: "E6B84A")
        case .midnightSignal: Color(hex: "7DE1D7")
        case .aurora: Color(hex: "13C9FF")
        case .transitMotion: Color(hex: "1477FF")
        case .coastlineExplorer: Color(hex: "FFC848")
        }
    }

    var page: Color {
        switch self {
        case .coastPulse: Color(hex: "EAF1F2")
        case .midnightSignal: Color(hex: "06182A")
        case .aurora: Color(hex: "050817")
        case .transitMotion: Color(hex: "F3F4F5")
        case .coastlineExplorer: Color(hex: "DFF4F3")
        }
    }

    var surface: Color {
        switch self {
        case .coastPulse, .transitMotion, .coastlineExplorer: .white
        case .midnightSignal: Color(hex: "0B2437")
        case .aurora: Color(hex: "0D1428")
        }
    }

    var primaryText: Color {
        switch preferredColorScheme {
        case .dark: Color(hex: "F5FBFF")
        default: Color(hex: "10272E")
        }
    }

    var mutedText: Color {
        switch preferredColorScheme {
        case .dark: Color(hex: "A9C4CF")
        default: Color(hex: "5B6D72")
        }
    }
}
