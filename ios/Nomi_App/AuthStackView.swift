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
    @State private var isGoogleWorking = false
    @State private var errorMessage: String?

    private let authService = AuthService()

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                VStack(spacing: 20) {
                    VStack(spacing: 10) {
                        Image("NomiMascot")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 112, height: 112)
                            .padding(10)
                            .background(.white.opacity(0.52), in: Circle())

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
                    .disabled(isWorking || isGoogleWorking || email.isEmpty || password.count < 6)

                    HStack(spacing: 12) {
                        Rectangle()
                            .fill(.secondary.opacity(0.24))
                            .frame(height: 1)

                        Text("or")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.secondary)

                        Rectangle()
                            .fill(.secondary.opacity(0.24))
                            .frame(height: 1)
                    }

                    Button {
                        continueWithGoogle()
                    } label: {
                        HStack(spacing: 12) {
                            if isGoogleWorking {
                                ProgressView()
                            } else {
                                Text("G")
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundStyle(.blue)
                                    .frame(width: 28, height: 28)
                                    .background(.white, in: Circle())
                                    .overlay(
                                        Circle()
                                            .stroke(.black.opacity(0.08), lineWidth: 1)
                                    )
                            }

                            Text("Continue with Google")
                                .fontWeight(.bold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(NomiSecondaryButtonStyle())
                    .disabled(isWorking || isGoogleWorking)

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

    private func continueWithGoogle() {
        isGoogleWorking = true
        errorMessage = nil

        Task {
            do {
                _ = try await authService.signInWithGoogle()
            } catch {
                errorMessage = error.localizedDescription
            }

            isGoogleWorking = false
        }
    }
}
