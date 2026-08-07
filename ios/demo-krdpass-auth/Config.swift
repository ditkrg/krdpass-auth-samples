//
//  Config.swift
//  demo-krdpass-auth
//
//  Configuration for the KRDPASS demo app.
//

import Foundation
import KrdpassAuth

/// App configuration, read from the process environment.
///
/// Set these in the Xcode scheme's Run > Arguments > Environment Variables tab, using
/// `ios/env.example` as the template, or let `./scripts/sync-secrets.sh` write them for you.
/// Xcode's scheme variables only apply when Xcode launches the process, so a build meant for
/// a plain on-device launch needs them baked into the shared scheme.
enum Config {
    /// Placeholders shipped in `env.example` and in the committed shared scheme. They exist so
    /// the scheme has a shape to copy, never so the app can run against them.
    private static let placeholders: Set<String> = [
        "your-client-id",
        "https://your-backend.example.com",
        "https://your-backend.example.com/_krdpass/oauth/callback",
    ]

    /// Fail on the first missing or still-placeholder value, with the same wording every
    /// sample in this repo uses: what is missing, which file supplies it, and how to generate
    /// it. Silently falling back to `your-backend.example.com` only converts a config mistake
    /// into a DNS error three screens later, which teaches nothing.
    private static func require(_ key: String) -> String {
        let value = (ProcessInfo.processInfo.environment[key] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, !placeholders.contains(value) else {
            fatalError(
                """
                KRDPASS demo config missing: \(key). Set it in the demo-krdpass-auth scheme \
                (Product > Scheme > Edit Scheme > Run > Arguments > Environment Variables) \
                using ios/env.example as the template, or run ./scripts/sync-secrets.sh from \
                the repository root.
                """
            )
        }
        return value
    }

    /// Backend server URL for PAR and token exchange
    static let backendUrl = require("KRD_BACKEND_URL")

    /// Redirect URI for Universal Links (must match Associated Domains)
    static let redirectUri = require("KRD_REDIRECT_URI")

    /// OAuth client ID
    static let clientId = require("KRD_CLIENT_ID")

    /// SDK environment. Optional: development is the safe default.
    static let environment: KrdpassEnvironment = {
        let raw = ProcessInfo.processInfo.environment["KRD_ENVIRONMENT"]?.lowercased() ?? "development"
        switch raw {
        case "production", "prod":
            return .production
        default:
            return .development
        }
    }()
}
