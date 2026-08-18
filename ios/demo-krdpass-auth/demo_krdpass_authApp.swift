import SwiftUI
import KrdpassAuth

@main
struct demo_krdpass_authApp: App {
    @State private var viewModel = AuthViewModel()

    var body: some Scene {
        WindowGroup {
            // Wires up both callback paths the SDK needs (Universal Link and URL scheme).
            // Without them the flow hangs waiting for a callback that never arrives.
            ContentView(viewModel: viewModel)
                .withKrdpassDeepLinkHandling(viewModel.krdpassAuth)
        }
    }
}
