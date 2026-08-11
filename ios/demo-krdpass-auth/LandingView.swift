import SwiftUI

struct LandingView: View {
    @Bindable var viewModel: AuthViewModel
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    Spacer(minLength: 24)
                    logoSection
                    Spacer().frame(height: 32)

                    if let error = viewModel.errorMessage {
                        errorCard(message: error)
                        Spacer().frame(height: 16)
                    }

                    configurationCard
                    Spacer().frame(height: 24)
                    signInButton
                    Spacer(minLength: 24)
                }
                .frame(minHeight: proxy.size.height)
                .padding(.horizontal, 24)
            }
        }
    }

    // MARK: - Logo Section

    private var logoSection: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(KrdpassColors.primary)
                    .frame(width: 72, height: 72)

                Image(systemName: "lock.fill")
                    .font(.system(size: 36))
                    .foregroundColor(.white)
            }

            VStack(spacing: 4) {
                Text("KRDPASS")
                    .font(.title)
                    .fontWeight(.black)

                Text("Digital Identity Demo")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Text("SwiftUI on iOS")
                    .font(.system(size: 12))
                    .foregroundColor(KrdpassColors.caption(for: colorScheme))
            }
        }
    }

    // MARK: - Error Card

    private func errorCard(message: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            // Icon chip: soft error tint so it reads as an accent, not an alarm.
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(KrdpassColors.error.opacity(0.12))
                    .frame(width: 36, height: 36)

                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(KrdpassColors.error)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Sign-in failed")
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)

                Text(message)
                    .font(.caption)
                    .foregroundColor(.primary.opacity(0.8))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)

                // provider_not_installed is the only sign-in failure the user can actually
                // fix, and the SDK hands us the URL that fixes it. Offer it as an action
                // instead of ending on an error message.
                if let installUrl = viewModel.installUrl {
                    Link("Install KRDPASS", destination: installUrl)
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(KrdpassColors.error)
                        .padding(.top, 4)
                }
            }

            Button {
                viewModel.clearError()
            } label: {
                Image(systemName: "xmark")
                    .font(.caption)
                    .foregroundColor(.primary.opacity(0.6))
            }
        }
        .padding(12)
        .background(KrdpassColors.error.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Configuration Card

    private var configurationCard: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Citizen Data")
                        .font(.subheadline)
                        .fontWeight(.bold)

                    Text("Include citizen_identity scope")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Toggle("", isOn: $viewModel.includeCitizenScope)
                    .labelsHidden()
                    .scaleEffect(0.8)
            }
            .frame(minHeight: 48)
            Divider()
                .padding(.vertical, 12)

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Offline Access")
                        .font(.subheadline)
                        .fontWeight(.bold)

                    Text("Include offline_access scope (Refresh Token)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Toggle("", isOn: $viewModel.includeOfflineScope)
                    .labelsHidden()
                    .scaleEffect(0.8)
            }
            .frame(minHeight: 48)
            Divider()
                .padding(.vertical, 12)

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Auth Mode")
                        .font(.subheadline)
                        .fontWeight(.bold)

                    Text(viewModel.useServerMode ? "Backend-mediated (Secure)" : "Direct (Client-only)")
                        .font(.caption)
                        .foregroundColor(KrdpassColors.primary)
                }

                Spacer()

                Toggle("", isOn: $viewModel.useServerMode)
                    .labelsHidden()
                    .scaleEffect(0.8)
            }
            .frame(minHeight: 48)
        }
        .padding(16)
        .background(KrdpassColors.surface(for: colorScheme))
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay(
            RoundedRectangle(cornerRadius: 24)
                .stroke(Color(.separator).opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: - Sign In Button

    private var signInButton: some View {
        Button {
            Task {
                await viewModel.signIn()
            }
        } label: {
            HStack(spacing: 12) {
                if viewModel.isSigningIn {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.8)
                } else {
                    Image("krdpass_logo")
                        .renderingMode(.template)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 20, height: 20)
                        .foregroundColor(.white)

                    Text("Sign in with KRDPASS")
                        .font(.system(size: 16, weight: .medium))
                        .kerning(0.32)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .foregroundColor(.white)
            .background(KrdpassColors.primary)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .disabled(viewModel.isSigningIn)
    }
}

#Preview {
    LandingView(viewModel: AuthViewModel())
}
