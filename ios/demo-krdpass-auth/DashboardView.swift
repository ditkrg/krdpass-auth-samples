//
//  DashboardView.swift
//  demo-krdpass-auth
//
//  Dashboard view shown after successful authentication - matches Android/Flutter demos.
//

import SwiftUI
import KrdpassAuth

struct DashboardView: View {
    var viewModel: AuthViewModel
    @State private var showDeveloperConsole = false
    @State private var showUserInfoProtocol = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            headerSection
            
            ScrollView {
                VStack(spacing: 20) {
                    // Identity Card
                    identityCard
                    
                    // Personal Details
                    personalDetailsSection
                    
                    // User Info Protocol
                    userInfoProtocolSection
                    
                    // Token Details
                    tokenDetailsSection
                    
                    Spacer(minLength: 16)
                    
                    // Token Management
                    tokenManagementSection
                    
                    Spacer(minLength: 32)
                }
                .padding(.horizontal, 24)
            }
        }
    }
    
    // MARK: - Header
    
    private var headerSection: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Welcome,")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                
                Text(viewModel.firstName.isEmpty ? "Citizen" : viewModel.firstName)
                    .font(.title2)
                    .fontWeight(.black)
            }
            
            Spacer()
            
            Button {
                viewModel.logout()
            } label: {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.system(size: 18))
                    .foregroundColor(.red)
                    .frame(width: 40, height: 40)
                    .background(Color.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
    }
    
    // MARK: - Identity Card
    
    private var identityCard: some View {
        VStack(spacing: 20) {
            HStack(alignment: .top, spacing: 16) {
                // Profile Image
                profileImage
                
                // Name and Email
                VStack(alignment: .leading, spacing: 2) {
                    Text(viewModel.fullName)
                        .font(.headline)
                        .fontWeight(.bold)
                        .lineLimit(2)
                    
                    Text(viewModel.email)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                
                Spacer()
            }
            
            // Verification Badge
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(KrdpassColors.success)
                    .font(.caption)
                
                Text("Official Verified Citizen")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundColor(KrdpassColors.success)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(KrdpassColors.success.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(KrdpassColors.success.opacity(0.2), lineWidth: 1)
            )
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay(
            RoundedRectangle(cornerRadius: 24)
                .stroke(Color(.separator).opacity(0.5), lineWidth: 1)
        )
    }
    
    private var profileImage: some View {
        ZStack {
            Circle()
                .fill(KrdpassColors.primary.opacity(0.1))
                .frame(width: 56, height: 56)
            
            if let urlString = viewModel.profilePicUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    Image(systemName: "person.fill")
                        .font(.title)
                        .foregroundColor(KrdpassColors.primary)
                }
                .frame(width: 56, height: 56)
                .clipShape(Circle())
            } else {
                Image(systemName: "person.fill")
                    .font(.title)
                    .foregroundColor(KrdpassColors.primary)
            }
        }
    }
    
    // MARK: - Token Management Section (See below)

    // MARK: - Personal Details
    
    private var personalDetailsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Personal Details")
                .font(.headline)
                .fontWeight(.bold)
            
            HStack(spacing: 12) {
                PersonalDetailCard(
                    icon: "calendar",
                    label: "Birth Date",
                    value: viewModel.birthdate ?? "N/A"
                )
                
                PersonalDetailCard(
                    icon: "person.crop.circle",
                    label: "Gender",
                    value: viewModel.sex ?? "N/A"
                )
            }
        }
    }
    
    // MARK: - User Info Protocol Section
    
    private var userInfoProtocolSection: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation {
                    showUserInfoProtocol.toggle()
                }
            } label: {
                HStack {
                    Image(systemName: "arrow.triangle.2.circlepath.circle.fill")
                        .foregroundColor(KrdpassColors.primary)
                    
                    Text("Remote User Info Protocol")
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundColor(.primary)
                    
                    Spacer()
                    
                    Image(systemName: showUserInfoProtocol ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(16)
            }
            
            if showUserInfoProtocol {
                VStack(spacing: 16) {
                    Text("Fetch the latest profile data directly from the OIDC UserInfo endpoint using your Access Token.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    
                    // Sync User Info Button
                    Button {
                        Task {
                            await viewModel.fetchUserInfo()
                        }
                    } label: {
                        HStack {
                            if viewModel.isLoading {
                                ProgressView()
                                    .scaleEffect(0.8)
                            } else {
                                Image(systemName: "arrow.triangle.2.circlepath")
                            }
                            Text(viewModel.isLoading ? "Syncing..." : "Sync with Remote UserInfo")
                        }
                        .font(.caption.weight(.bold))
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity)
                        .background(KrdpassColors.primary.opacity(0.1))
                        .foregroundColor(KrdpassColors.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(viewModel.isLoading)
                    
                    if let userInfo = viewModel.userInfo {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(KrdpassColors.success)
                            Text("Successfully synced!")
                                .font(.caption.weight(.bold))
                                .foregroundColor(KrdpassColors.success)
                            Spacer()
                        }
                        .padding(12)
                        .background(KrdpassColors.success.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        
                        claimSection(title: "UserInfo Claims", claims: userInfo.raw)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color(.separator).opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: - Token Details Section
    
    private var tokenDetailsSection: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation {
                    showDeveloperConsole.toggle()
                }
            } label: {
                HStack {
                    Image(systemName: "key.fill")
                        .foregroundColor(KrdpassColors.primary)
                    
                    Text("Token Details")
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundColor(.primary)
                    
                    Spacer()
                    
                    Image(systemName: showDeveloperConsole ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(16)
            }
            
            if showDeveloperConsole {
                VStack(spacing: 16) {
                    claimSection(title: "ID Token Claims", claims: viewModel.idTokenClaims)
                    claimSection(title: "Access Token Claims", claims: viewModel.accessTokenClaims)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color(.separator).opacity(0.3), lineWidth: 1)
        )
    }
    
    private func claimSection(title: String, claims: [String: Any]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .fontWeight(.bold)
                .foregroundColor(KrdpassColors.primary)
            
            VStack(alignment: .leading, spacing: 4) {
                if claims.isEmpty {
                    Text("No claims available")
                        .font(.caption2)
                        .italic()
                        .foregroundColor(.secondary)
                        .padding(8)
                } else {
                    ForEach(Array(claims.keys.sorted()), id: \.self) { key in
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(key):")
                                .font(.caption2)
                                .fontWeight(.bold)
                                .frame(width: 100, alignment: .leading)
                            
                            Text(String(describing: claims[key] ?? ""))
                                .font(.caption2)
                                .foregroundColor(.secondary)
                                .lineLimit(3)
                        }
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
    
    // MARK: - Token Management Section
    
    private var tokenManagementSection: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "gearshape.fill")
                    .foregroundColor(KrdpassColors.primary)
                
                Text("Token Management")
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)
                
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            
            // Result Message (if any)
            if let message = viewModel.actionMessage {
                HStack {
                    Image(systemName: "info.circle.fill")
                        .font(.caption)
                    Text(message)
                        .font(.caption)
                }
                .foregroundColor(.secondary)
                .padding(.horizontal, 16)
                .transition(.opacity)
            }
            
            VStack(spacing: 12) {
                Button {
                    Task { await viewModel.verifyToken() }
                } label: {
                    Text("Verify Token Signature")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(KrdpassColors.primary.opacity(0.1))
                        .foregroundColor(KrdpassColors.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                
                Button {
                    Task { await viewModel.refreshToken() }
                } label: {
                    Text("Refresh Access Token")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.orange.opacity(0.1))
                        .foregroundColor(.orange)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                
                Button {
                    Task { await viewModel.revokeToken() }
                } label: {
                    Text("Revoke Token (Log Out)")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.red.opacity(0.1))
                        .foregroundColor(.red)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color(.separator).opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - Personal Detail Card

struct PersonalDetailCard: View {
    let icon: String
    let label: String
    let value: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.caption)
                    .foregroundColor(KrdpassColors.primary.opacity(0.7))
                
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Text(value)
                .font(.subheadline)
                .fontWeight(.bold)
                .lineLimit(1)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground).opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

#Preview {
    DashboardView(viewModel: AuthViewModel())
}
