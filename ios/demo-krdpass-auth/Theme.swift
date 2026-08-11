import SwiftUI

/// KRDPASS brand colors matching Flutter/Android SDKs
enum KrdpassColors {
    static let primary = Color(hex: 0x00AAFF)

    static let success = Color(hex: 0x00CE2A)

    static let error = Color(hex: 0xFF001D)

    static let backgroundLight = Color.white
    static let backgroundDark = Color(hex: 0x121212)

    static let surfaceLight = Color(hex: 0xF1FAFF)
    static let surfaceDark = Color(hex: 0x1E1E1E)

    static let captionLight = Color(hex: 0x5F6368)
    static let captionDark = Color(hex: 0xB8BDC4)

    static let line = Color(hex: 0xCDD6DE)

    static func background(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? backgroundDark : backgroundLight
    }

    static func surface(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? surfaceDark : surfaceLight
    }

    static func caption(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? captionDark : captionLight
    }
}

// MARK: - Color Extension for Hex Support

extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xff) / 255,
            green: Double((hex >> 08) & 0xff) / 255,
            blue: Double((hex >> 00) & 0xff) / 255,
            opacity: alpha
        )
    }
}
