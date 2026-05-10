import Foundation

enum BackendConfig {
    private static let productionURL = URL(string: "https://nomirecall.onrender.com/api")!

    static var apiBaseURL: URL {
        if let value = Bundle.main.object(forInfoDictionaryKey: "NOMI_BACKEND_API_BASE_URL") as? String,
           value.hasPrefix("http"),
           let url = URL(string: value) {
            return url
        }

        return productionURL
    }
}
