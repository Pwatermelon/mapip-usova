import SwiftUI
import MapKit

/// Построение маршрута через routing API (отдельный сервис за `/routing/`).
struct RouterScreen: View {
    @AppStorage(MapipConfig.baseURLKey) private var serverURL = MapipConfig.defaultBaseURL
    @State private var fromText = ""
    @State private var toText = ""
    @State private var profile = "wheelchair"
    @State private var alternatives = 3
    @State private var message: String?
    @State private var error: String?
    @State private var showServerSettings = false
    @State private var coords: [CLLocationCoordinate2D] = []
    @State private var objects: [MapObjectDTO] = []
    @State private var position: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 51.533557, longitude: 46.034257),
            span: MKCoordinateSpan(latitudeDelta: 0.06, longitudeDelta: 0.06)
        )
    )

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                TextField("Откуда", text: $fromText)
                    .textFieldStyle(.roundedBorder)
                TextField("Куда", text: $toText)
                    .textFieldStyle(.roundedBorder)
                Picker("Профиль", selection: $profile) {
                    Text("Колясочник").tag("wheelchair")
                    Text("Пешеход").tag("foot-walking")
                }
                .pickerStyle(.segmented)
                Picker("Вариантов", selection: $alternatives) {
                    Text("1").tag(1)
                    Text("2").tag(2)
                    Text("3").tag(3)
                }
                .pickerStyle(.segmented)

                Button("Построить") {
                    Task { await build() }
                }
                .buttonStyle(.borderedProminent)

                if let error {
                    Text(error).foregroundStyle(.red).font(.caption)
                }
                if let message {
                    Text(message).font(.caption).foregroundStyle(.secondary)
                }

                Map(position: $position) {
                    ForEach(objects) { o in
                        Annotation(o.display_name, coordinate: CLLocationCoordinate2D(latitude: o.x, longitude: o.y)) {
                            Circle().fill(.blue).frame(width: 8, height: 8)
                        }
                    }
                    if coords.count >= 2 {
                        MapPolyline(coordinates: coords)
                            .stroke(.purple, lineWidth: 5)
                    }
                }
                .mapStyle(.standard)
                .frame(minHeight: 280)
            }
            .padding()
            .navigationTitle("Маршрутизатор")
            .task { await loadObjects() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Сервер") {
                        showServerSettings = true
                    }
                }
            }
            .sheet(isPresented: $showServerSettings) {
                NavigationStack {
                    Form {
                        Section("URL сервера маршрутизатора") {
                            TextField("https://host:port", text: $serverURL)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                    }
                    .navigationTitle("Настройки сервера")
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Закрыть") { showServerSettings = false }
                        }
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Сохранить") {
                                MapipConfig.baseURLString = serverURL
                                showServerSettings = false
                            }
                        }
                    }
                }
            }
        }
    }

    private func build() async {
        error = nil
        message = nil
        coords = []
        guard !fromText.isEmpty, !toText.isEmpty else {
            error = "Заполните оба поля"
            return
        }
        do {
            let api = MapipAPI()
            let a = try await api.geocode(query: fromText)
            let b = try await api.geocode(query: toText)
            guard let fa = a.first, let fb = b.first else {
                error = "Точки не найдены"
                return
            }
            let data = try await api.buildRoute(
                from: [fa.lat, fa.lon],
                to: [fb.lat, fb.lon],
                profile: profile,
                alternativeCount: alternatives
            )
            let line = try decodeLineCoordinates(from: data)
            coords = line.map { CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) }
            if let reg = boundingRegion(for: coords) {
                position = .region(reg)
            }
            message = "Маршрут получен (\(coords.count) точек)"
        } catch {
            self.error = String(describing: error)
        }
    }

    private func loadObjects() async {
        do {
            let api = MapipAPI()
            objects = try await api.fetchMapObjects()
        } catch {
            // keep map usable even when core API unavailable
            objects = []
        }
    }
}

private func decodeLineCoordinates(from data: Data) throws -> [[Double]] {
    let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let features = obj?["features"] as? [[String: Any]] ?? []
    var out: [[Double]] = []
    for f in features {
        guard let geom = f["geometry"] as? [String: Any] else { continue }
        if geom["type"] as? String == "LineString",
           let c = geom["coordinates"] as? [[Double]] {
            for pair in c where pair.count >= 2 {
                out.append([pair[1], pair[0]])
            }
        }
    }
    return out
}

private func boundingRegion(for coords: [CLLocationCoordinate2D]) -> MKCoordinateRegion? {
    guard !coords.isEmpty else { return nil }
    var minLat = coords[0].latitude, maxLat = coords[0].latitude
    var minLon = coords[0].longitude, maxLon = coords[0].longitude
    for c in coords {
        minLat = min(minLat, c.latitude)
        maxLat = max(maxLat, c.latitude)
        minLon = min(minLon, c.longitude)
        maxLon = max(maxLon, c.longitude)
    }
    let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2)
    let span = MKCoordinateSpan(
        latitudeDelta: max((maxLat - minLat) * 1.35, 0.01),
        longitudeDelta: max((maxLon - minLon) * 1.35, 0.01)
    )
    return MKCoordinateRegion(center: center, span: span)
}
