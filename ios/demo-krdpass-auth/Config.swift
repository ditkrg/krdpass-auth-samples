//
//  Config.swift
//  demo-krdpass-auth
//
//  Configuration for the KRDPASS demo app.
//

import Foundation
import KrdpassAuth

/// App configuration - matches Flutter/Android demo configuration
///
/// Environment variables (set via the Xcode scheme's Run > Arguments tab, see env.example)
/// override these defaults. The defaults match the committed shared scheme's own Environment
/// Variables, so a plain on-device launch (tapping the icon, no Xcode env injection) still
/// works: Xcode's scheme env vars only apply when Xcode itself launches the process.
enum Config {
    private static func env(_ key: String, default defaultValue: String) -> String {
        let value = ProcessInfo.processInfo.environment[key] ?? ""
        return value.isEmpty ? defaultValue : value
    }

    /// Backend server URL for PAR and token exchange
    static let backendUrl = env("KRD_BACKEND_URL", default: "https://your-backend.example.com")

    /// Redirect URI for Universal Links (must match Associated Domains)
    static let redirectUri = env(
        "KRD_REDIRECT_URI", default: "https://your-backend.example.com/_krdpass/oauth/callback")

    /// OAuth client ID
    static let clientId = env("KRD_CLIENT_ID", default: "your-client-id")
    
    /// SDK environment
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
