import SwiftUI

struct ContentView: View {
    var viewModel: AuthViewModel
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            // Above the landing/dashboard switch on purpose: "Tokens revoked, signed out" is
            // reported by the action that removes the dashboard, so a line rendered inside it
            // would never be seen.
            if let message = viewModel.actionMessage {
                // The kind drives the icon and the colour; the text is only ever text.
                HStack {
                    Image(systemName: message.ok ? "info.circle.fill" : "exclamationmark.triangle.fill")
                        .font(.caption)
                    Text(message.text)
                        .font(.caption)
                    Spacer()
                }
                .foregroundColor(message.ok ? .secondary : KrdpassColors.error)
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .transition(.opacity)
            }

            if viewModel.tokens != nil {
                DashboardView(viewModel: viewModel)
            } else {
                LandingView(viewModel: viewModel)
            }
        }
        .background(KrdpassColors.background(for: colorScheme))
        .animation(.easeInOut, value: viewModel.tokens != nil)
    }
}

#Preview {
    ContentView(viewModel: AuthViewModel())
}
