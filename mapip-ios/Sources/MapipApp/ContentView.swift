import SwiftUI
import MapKit

struct ContentView: View {
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            MapScreen()
                .tabItem { Label("Карта", systemImage: "map") }
                .tag(0)
            RouterScreen()
                .tabItem { Label("Маршрут", systemImage: "location.north.line.fill") }
                .tag(1)
        }
    }
}

/// Карта объектов из core API.
struct MapScreen: View {
    @State private var objects: [MapObjectDTO] = []
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 51.533557, longitude: 46.034257),
        span: MKCoordinateSpan(latitudeDelta: 0.08, longitudeDelta: 0.08)
    )
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Map(coordinateRegion: $region, annotationItems: objects) { o in
                    MapAnnotation(coordinate: CLLocationCoordinate2D(latitude: o.x, longitude: o.y)) {
                        VStack(spacing: 2) {
                            Image(systemName: "mappin.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.blue)
                            Text(o.display_name)
                                .font(.caption2)
                                .lineLimit(1)
                                .frame(maxWidth: 120)
                        }
                    }
                }
                .mapStyle(.standard(elevation: .realistic))

                if let error {
                    Text(error)
                        .padding()
                        .background(.ultraThinMaterial)
                        .cornerRadius(10)
                }
            }
            .navigationTitle("MAPIP")
            .task { await load() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Обновить") { Task { await load() } }
                }
            }
        }
    }

    private func load() async {
        error = nil
        do {
            let api = MapipAPI()
            objects = try await api.fetchMapObjects()
        } catch {
            self.error = String(describing: error)
        }
    }
}

#Preview {
    ContentView()
}
