import Foundation

enum MapipConfig {
    static let baseURLKey = "mapip.baseURL"
    static let defaultBaseURL = "http://127.0.0.1:8088"

    static var baseURLString: String {
        get {
            let raw = UserDefaults.standard.string(forKey: baseURLKey)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return (raw?.isEmpty == false ? raw! : defaultBaseURL)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: baseURLKey)
        }
    }

    static var baseURL: URL {
        URL(string: baseURLString) ?? URL(string: defaultBaseURL)!
    }
}
