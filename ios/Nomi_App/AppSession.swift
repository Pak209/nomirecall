import Foundation
import FirebaseAuth
import FirebaseCore

@MainActor
final class AppSession: ObservableObject {
    @Published private(set) var user: User?
    @Published private(set) var profile: UserProfile?
    @Published private(set) var isLoading = true
    @Published private(set) var isShowingSplash = true
    @Published var errorMessage: String?

    private var authStateHandle: AuthStateDidChangeListenerHandle?
    private let userProfileService = UserProfileService()

    init() {
        startSplashTimer()

        guard FirebaseAppReady.isConfigured else {
            isLoading = false
            return
        }

        authStateHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.isLoading = true
                self?.user = user
                await self?.loadProfile(for: user)
            }
        }
    }

    deinit {
        if let authStateHandle {
            Auth.auth().removeStateDidChangeListener(authStateHandle)
        }
    }

    var route: AppRoute {
        if isShowingSplash {
            return .splash
        }

        if isLoading {
            return .loading
        }

        guard user != nil else {
            return .auth
        }

        if profile?.onboardingCompleted == true {
            return .mainTabs
        }

        return .onboarding
    }

    func completeOnboarding() async {
        guard let user else { return }

        do {
            let updatedProfile = try await userProfileService.markOnboardingComplete(userId: user.uid)
            profile = updatedProfile
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() {
        do {
            try AuthService().signOut()
            profile = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func startSplashTimer() {
        Task {
            try? await Task.sleep(nanoseconds: 1_250_000_000)
            isShowingSplash = false
        }
    }

    private func loadProfile(for user: User?) async {
        defer { isLoading = false }

        guard let user else {
            profile = nil
            return
        }

        do {
            profile = try await userProfileService.profile(for: user)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

enum FirebaseAppReady {
    static var isConfigured: Bool {
        FirebaseApp.app() != nil
    }
}

enum AppRoute {
    case splash
    case loading
    case auth
    case onboarding
    case mainTabs
}
