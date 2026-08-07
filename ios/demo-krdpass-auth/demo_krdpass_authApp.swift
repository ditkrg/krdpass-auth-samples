//
//  demo_krdpass_authApp.swift
//  demo-krdpass-auth
//
//

import SwiftUI
import KrdpassAuth

@main
struct demo_krdpass_authApp: App {
    @State private var viewModel = AuthViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView(viewModel: viewModel)
                .onOpenURL { url in
                    // Handle Universal Link callback from KRDPASS
                    viewModel.handleDeepLink(url)
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    guard let url = activity.webpageURL else { return }
                    viewModel.handleDeepLink(url)
                }
        }
    }
}
