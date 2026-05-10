import SwiftUI

struct AuthStackView: View {
    enum Mode: String, CaseIterable {
        case signIn = "Sign in"
        case signUp = "Sign up"
    }

    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    private let authService = AuthService()

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                VStack(spacing: 24) {
                    VStack(spacing: 12) {
                        Image("AppIcon")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 96, height: 96)
                            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

                        Text("Nomi")
                            .font(.system(size: 44, weight: .bold, design: .rounded))

                        Text("Capture what matters. Recall it when you need it.")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }

                    Picker("Auth mode", selection: $mode) {
                        ForEach(Mode.allCases, id: \.self) { mode in
                            Text(mode.rawValue)
                        }
                    }
                    .pickerStyle(.segmented)

                    VStack(spacing: 14) {
                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .nomiTextField()

                        SecureField("Password", text: $password)
                            .textContentType(mode == .signUp ? .newPassword : .password)
                            .nomiTextField()
                    }

                    Button {
                        submit()
                    } label: {
                        HStack {
                            if isWorking {
                                ProgressView()
                                    .tint(.white)
                            }

                            Text(mode.rawValue)
                                .fontWeight(.bold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(NomiPrimaryButtonStyle())
                    .disabled(isWorking || email.isEmpty || password.count < 6)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(24)
            }
            .navigationBarHidden(true)
        }
    }

    private func submit() {
        isWorking = true
        errorMessage = nil

        Task {
            do {
                switch mode {
                case .signIn:
                    _ = try await authService.signIn(email: email, password: password)
                case .signUp:
                    _ = try await authService.signUp(email: email, password: password)
                }
            } catch {
                errorMessage = error.localizedDescription
            }

            isWorking = false
        }
    }
}
