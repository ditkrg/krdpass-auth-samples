//
//  Theme.swift
//  demo-krdpass-auth
//
//  Color theme matching Flutter/Android demos.
//

import SwiftUI

/// KRDPASS brand colors matching Flutter/Android SDKs
enum KrdpassColors {
    // Primary brand color
    static let primary = Color(hex: 0x00AAFF)

    // Success/Verified color
    static let success = Color(hex: 0x00CE2A)

    // Error color
    static let error = Color(hex: 0xFF001D)

    // Background colors
    static let backgroundLight = Color.white
    static let backgroundDark = Color(hex: 0x121212)

    // Surface colors
    static let surfaceLight = Color(hex: 0xF1FAFF)
    static let surfaceDark = Color(hex: 0x1E1E1E)

    // Caption/Secondary text
    static let captionLight = Color(hex: 0x5F6368)
    static let captionDark = Color(hex: 0xB8BDC4)

    // Line/Divider color
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
