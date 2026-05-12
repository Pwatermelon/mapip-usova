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

struct OverpassPoint: Identifiable, Hashable {
    let id = UUID()
    let lat: Double
    let lon: Double
    let title: String
}

struct CurrentUserDTO: Codable {
    let id: Int
    let name: String?
    /// Категория доступности (legacy 0…4), не путать с правами администратора.
    let type: Int?
    let email: String?
    let score: Int?
    /// С сервера (`/api/users/current-user`); регистрация не выставляет админа.
    let isAdmin: Bool?
}

enum MapipAPIError: Error {
    case badURL
    case status(Int, String)
    case decode
}

/// Общий `URLSession` с cookie — сессия как в веб (`/api/users/login` → `/client/AddMapObject`).
final class MapipAPI: @unchecked Sendable {
    static let shared = MapipAPI()

    private static let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieAcceptPolicy = .always
        cfg.httpShouldSetCookies = true
        cfg.httpCookieStorage = HTTPCookieStorage.shared
        return URLSession(configuration: cfg)
    }()

    private var base: URL { MapipConfig.baseURL }

    private init() {}

    private func data(for request: URLRequest) async throws -> Data {
        let (data, res) = try await Self.session.data(for: request)
        guard let http = res as? HTTPURLResponse else { throw MapipAPIError.badURL }
        guard (200 ... 299).contains(http.statusCode) else {
            throw MapipAPIError.status(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    func fetchMapObjects() async throws -> [MapObjectDTO] {
        let url = base.appendingPathComponent("GetSocialMapObject")
        let (data, res) = try await Self.session.data(from: url)
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
        let (data, res) = try await Self.session.data(from: url)
        guard let http = res as? HTTPURLResponse else { throw MapipAPIError.badURL }
        guard (200 ... 299).contains(http.statusCode) else {
            throw MapipAPIError.status(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode([GeocodeHit].self, from: data)
    }

    func buildRoute(from: [Double], to: [Double], profile: String, alternativeCount: Int, via: [Double]? = nil) async throws -> Data {
        let url = base.appendingPathComponent("routing/v1/directions/geojson")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = [
            "from": from,
            "to": to,
            "profile": profile,
            "alternativeCount": alternativeCount,
        ]
        if let via {
            body["via"] = [via]
        }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await data(for: req)
    }

    func overpassPoints(bbox: String, profile: String) async throws -> [OverpassPoint] {
        var c = URLComponents(url: base.appendingPathComponent("routing/v1/overpass/objects"), resolvingAgainstBaseURL: false)!
        c.queryItems = [
            URLQueryItem(name: "bbox", value: bbox),
            URLQueryItem(name: "profile", value: profile),
        ]
        guard let url = c.url else { throw MapipAPIError.badURL }
        let (data, res) = try await Self.session.data(from: url)
        guard let http = res as? HTTPURLResponse else { throw MapipAPIError.badURL }
        guard (200 ... 299).contains(http.statusCode) else {
            throw MapipAPIError.status(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        let raw = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let features = raw?["features"] as? [[String: Any]] ?? []
        var points: [OverpassPoint] = []
        for f in features {
            guard let geom = f["geometry"] as? [String: Any],
                  let t = geom["type"] as? String,
                  t == "Point",
                  let c = geom["coordinates"] as? [Double],
                  c.count >= 2 else { continue }
            let props = f["properties"] as? [String: Any]
            let label = (props?["label"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            points.append(OverpassPoint(lat: c[1], lon: c[0], title: (label?.isEmpty == false ? label! : "Объект инфраструктуры")))
        }
        return points
    }

    // MARK: - Auth

    func login(email: String, password: String) async throws {
        let url = base.appendingPathComponent("api/users/login")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = ["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        _ = try await data(for: req)
    }

    func logout() async throws {
        let url = base.appendingPathComponent("api/users/logout")
        let req = URLRequest(url: url)
        _ = try? await data(for: req)
    }

    func currentUser() async throws -> CurrentUserDTO? {
        let url = base.appendingPathComponent("api/users/current-user")
        let req = URLRequest(url: url)
        let (data, res) = try await Self.session.data(for: req)
        guard let http = res as? HTTPURLResponse else { throw MapipAPIError.badURL }
        if http.statusCode == 401 {
            return nil
        }
        guard (200 ... 299).contains(http.statusCode) else {
            throw MapipAPIError.status(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode(CurrentUserDTO.self, from: data)
    }

    func register(name: String, type: Int, email: String, password: String) async throws {
        let url = base.appendingPathComponent("api/users/AddUser")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "name": name,
            "type": type,
            "email": email.trimmingCharacters(in: .whitespacesAndNewlines),
            "password": password,
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        _ = try await data(for: req)
    }

    // MARK: - Add object (legacy /client/AddMapObject)

    func fetchAccessibilityOptions() async throws -> [String] {
        let url = base.appendingPathComponent("api/SocialMapObject/get/accessibility")
        let d = try await data(for: URLRequest(url: url))
        return try JSONDecoder().decode([String].self, from: d)
    }

    func fetchInfrastructureDict() async throws -> [String: [String]] {
        let url = base.appendingPathComponent("api/admin/get/infrastructure")
        let d = try await data(for: URLRequest(url: url))
        guard let obj = try JSONSerialization.jsonObject(with: d) as? [String: [String]] else {
            throw MapipAPIError.decode
        }
        return obj
    }

    func addMapObjectMultipart(
        name: String,
        address: String,
        type: String,
        description: String,
        workingHours: String,
        latitude: Double?,
        longitude: Double?,
        accessibility: [String],
        disabilityCategory: [String],
        imageParts: [(data: Data, filename: String, mime: String)],
        userId: Int?,
    ) async throws {
        let url = base.appendingPathComponent("client/AddMapObject")
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        func appendField(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append(value.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }

        appendField("name", name)
        appendField("address", address)
        appendField("type", type)
        appendField("description", description)
        appendField("workingHours", workingHours)
        if let lat = latitude { appendField("latitude", String(lat)) }
        if let lon = longitude { appendField("longitude", String(lon)) }
        for a in accessibility { appendField("accessibility", a) }
        for d in disabilityCategory { appendField("disabilityCategory", d) }
        if let userId {
            appendField("userId", String(userId))
            appendField("mapObjectId", "0")
            appendField("excluded", "false")
        }

        for part in imageParts {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append(
                "Content-Disposition: form-data; name=\"images\"; filename=\"\(part.filename)\"\r\n".data(using: .utf8)!,
            )
            body.append("Content-Type: \(part.mime)\r\n\r\n".data(using: .utf8)!)
            body.append(part.data)
            body.append("\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        req.httpBody = body
        _ = try await data(for: req)
    }
}
