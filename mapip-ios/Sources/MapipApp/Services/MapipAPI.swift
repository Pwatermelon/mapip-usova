import Foundation

struct MapObjectDTO: Codable, Identifiable {
    let id: Int
    let x: Double
    let y: Double
    let display_name: String
    let adress: String
    let type: String
}

struct GeocodeHit: Codable {
    let lat: Double
    let lon: Double
    let display_name: String
}

enum MapipAPIError: Error {
    case badURL
    case status(Int, String)
    case decode
}

actor MapipAPI {
    private let session: URLSession
    private let base: URL

    init(baseURL: URL = MapipConfig.baseURL) {
        self.base = baseURL
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieAcceptPolicy = .always
        cfg.httpShouldSetCookies = true
        self.session = URLSession(configuration: cfg)
    }

    func fetchMapObjects() async throws -> [MapObjectDTO] {
        let url = base.appendingPathComponent("GetSocialMapObject")
        let (data, res) = try await session.data(from: url)
        guard let http = res as? HTTPURLResponse else { throw MapipAPIError.badURL }
        guard (200 ... 299).contains(http.statusCode) else {
            throw MapipAPIError.status(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode([MapObjectDTO].self, from: data)
    }

    func geocode(query: String) async throws -> [GeocodeHit] {
        var c = URLComponents(url: base.appendingPathComponent("routing/v1/geocode/search"), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "q", value: query)]
        guard let url = c.url else { throw MapipAPIError.badURL }
        let (data, res) = try await session.data(from: url)
        guard let http = res as? HTTPURLResponse else { throw MapipAPIError.badURL }
        guard (200 ... 299).contains(http.statusCode) else {
            throw MapipAPIError.status(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode([GeocodeHit].self, from: data)
    }

    func buildRoute(from: [Double], to: [Double], profile: String) async throws -> Data {
        let url = base.appendingPathComponent("routing/v1/directions/geojson")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "from": from,
            "to": to,
            "profile": profile,
            "alternativeCount": 1,
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, res) = try await session.data(for: req)
        guard let http = res as? HTTPURLResponse else { throw MapipAPIError.badURL }
        guard (200 ... 299).contains(http.statusCode) else {
            throw MapipAPIError.status(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }
}
