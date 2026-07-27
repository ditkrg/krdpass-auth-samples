//
//  ContentView.swift
//  demo-krdpass-auth
//
//  Main content view that switches between landing and dashboard.
//

import SwiftUI

struct ContentView: View {
    var viewModel: AuthViewModel
    @Environment(\.colorScheme) private var colorScheme
    
    var body: some View {
        Group {
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
