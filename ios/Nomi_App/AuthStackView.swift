import SwiftUI

struct AuthStackView: View {
    enum Mode: String, CaseIterable {
        case signIn = "Sign in"
        case signUp = "Sign up"
    }

    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var username = ""
    @State private var password = ""
    @State private var rememberMe = false
    @State private var hasRememberedCredentials = false
    @State private var biometricDisplayName = "Face ID"
    @State private var isWorking = false
    @State private var isGoogleWorking = false
    @State private var isBiometricWorking = false
    @State private var errorMessage: String?

    private let authService = AuthService()
    private let userProfileService = UserProfileService()
    private let credentialStore = BiometricCredentialStore()

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

                        if mode == .signUp {
                            TextField("Username (optional)", text: $username)
                                .textContentType(.username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .nomiTextField()
                        }

                        SecureField("Password", text: $password)
                            .textContentType(mode == .signUp ? .newPassword : .password)
                            .nomiTextField()
                    }

                    if mode == .signIn {
                        VStack(spacing: 12) {
                            Toggle("Remember me", isOn: $rememberMe)
                                .font(.subheadline.weight(.semibold))
                                .tint(.pink)
                                .onChange(of: rememberMe) { _, isEnabled in
                                    updateRememberMePreference(isEnabled)
                                }

                            if hasRememberedCredentials && credentialStore.canUseBiometrics {
                                Button {
                                    signInWithBiometrics()
                                } label: {
                                    HStack(spacing: 10) {
                                        if isBiometricWorking {
                                            ProgressView()
                                        } else {
                                            Image(systemName: biometricDisplayName == "Face ID" ? "faceid" : "touchid")
                                                .font(.title3)
                                        }

                                        Text("Sign in with \(biometricDisplayName)")
                                            .fontWeight(.bold)
                                    }
                                    .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(NomiSecondaryButtonStyle())
                                .disabled(isWorking || isGoogleWorking || isBiometricWorking)
                            }
                        }
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
                    .disabled(isWorking || isGoogleWorking || isBiometricWorking || email.isEmpty || password.count < 6)

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
                    .disabled(isWorking || isGoogleWorking || isBiometricWorking)

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
            .onAppear {
                syncRememberedCredentialState()
            }
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
                    updateSavedCredentialsAfterEmailAuth()
                case .signUp:
                    let user = try await authService.signUp(email: email, password: password)
                    let cleanedUsername = UserProfileService.normalizedUsername(username)
                    if !cleanedUsername.isEmpty {
                        _ = try await userProfileService.updateUsername(userId: user.uid, username: cleanedUsername)
                    }
                }
            } catch {
                errorMessage = error.localizedDescription
            }

            isWorking = false
        }
    }

    private func signInWithBiometrics() {
        isBiometricWorking = true
        errorMessage = nil

        Task {
            do {
                let credentials = try credentialStore.loadWithBiometrics(
                    reason: "Use \(biometricDisplayName) to sign in to Nomi."
                )
                email = credentials.email
                password = credentials.password
                _ = try await authService.signIn(email: credentials.email, password: credentials.password)
            } catch {
                errorMessage = error.localizedDescription
            }

            password = ""
            isBiometricWorking = false
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

    private func updateRememberMePreference(_ isEnabled: Bool) {
        guard mode == .signIn else { return }

        if isEnabled {
            credentialStore.isRememberMeEnabled = true
            return
        }

        do {
            try credentialStore.forgetCredentials()
            syncRememberedCredentialState(shouldKeepTypedEmail: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func updateSavedCredentialsAfterEmailAuth() {
        do {
            if rememberMe {
                try credentialStore.save(email: email, password: password)
            } else {
                try credentialStore.forgetCredentials()
            }

            syncRememberedCredentialState()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func syncRememberedCredentialState(shouldKeepTypedEmail: Bool = false) {
        rememberMe = credentialStore.isRememberMeEnabled
        hasRememberedCredentials = credentialStore.hasRememberedCredentials
        biometricDisplayName = credentialStore.biometricDisplayName

        if !shouldKeepTypedEmail, email.isEmpty {
            email = credentialStore.rememberedEmail
        }
    }
}
