import Foundation

enum BackendConfig {
    private static let productionURL = URL(string: "https://nomirecall.onrender.com/api")!

    static var apiBaseURL: URL {
        if let value = configuredURLString,
           value.hasPrefix("http"),
           let url = URL(string: value) {
            return url
        }

        return productionURL
    }

    private static var configuredURLString: String? {
        if let value = ProcessInfo.processInfo.environment["NOMI_BACKEND_API_BASE_URL"],
           !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return value
        }

        if let value = Bundle.main.object(forInfoDictionaryKey: "NOMI_BACKEND_API_BASE_URL") as? String,
           !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return value
        }

        return nil
    }

    static var publicBaseURL: URL {
        apiBaseURL.deletingLastPathComponent()
    }

    #if DEBUG
    static var allowsLocalDebugTools: Bool {
        guard let host = apiBaseURL.host?.lowercased() else { return false }
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }
    #else
    static var allowsLocalDebugTools: Bool { false }
    #endif
}


enum NomiShareLinks {
    /// Destination for outbound share footers. Swap to the TestFlight public
    /// link (then the App Store URL) once those exist — one place to change.
    static let marketingURL = "https://testflight.apple.com/join/KVUNpuJ1"
}
