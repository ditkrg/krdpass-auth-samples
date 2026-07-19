//
//  LandingView.swift
//  demo-krdpass-auth
//
//  Landing screen with sign-in button - matches Android/Flutter demos.
//

import SwiftUI

struct LandingView: View {
    @Bindable var viewModel: AuthViewModel
    
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer()
                    .frame(height: 40)
                
                // Logo
                logoSection
                
                Spacer()
                
                // Error card
                if let error = viewModel.errorMessage {
                    errorCard(message: error)
                }
                
                // Configuration card
                configurationCard
                
                // Sign in button
                signInButton
                
                Spacer()
                    .frame(height: 40)
            }
            .padding(.horizontal, 24)
        }
    }
    
    // MARK: - Logo Section
    
    private var logoSection: some View {
        VStack(spacing: 16) {
            // Logo circle
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
            }
        }
    }
    
    // MARK: - Error Card
    
    private func errorCard(message: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            // Icon chip: soft error tint so it reads as an accent, not an alarm.
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.red.opacity(0.12))
                    .frame(width: 36, height: 36)

                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.red)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Sign-in failed")
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)

                ScrollView {
                    Text(message)
                        .font(.caption)
                        .foregroundColor(.primary.opacity(0.8))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 140)
            }

            Button {
                viewModel.clearError()
            } label: {
                Image(systemName: "xmark")
                    .font(.caption)
                    .foregroundColor(.primary.opacity(0.6))
            }
        }
        .padding(16)
        .background(Color.red.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }
    
    // MARK: - Configuration Card
    
    private var configurationCard: some View {
        VStack(spacing: 0) {
            // Citizen Data Toggle
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
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()
                .padding(.horizontal, 16)

            // Offline Access Toggle
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
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            
            Divider()
                .padding(.horizontal, 16)
            
            // Auth Mode Toggle
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
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(Color(.systemBackground))
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
                if viewModel.isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.8)
                } else {
                    // KRDPASS icon
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
        .disabled(viewModel.isLoading)
    }
}

#Preview {
    LandingView(viewModel: AuthViewModel())
}
