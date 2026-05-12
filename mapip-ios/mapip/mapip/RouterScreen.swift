import SwiftUI
import MapKit
import CoreLocation
import Combine

private struct RouteLine: Identifiable {
    let id = UUID()
    let coordinates: [CLLocationCoordinate2D]
    let index: Int
}

private enum MapPickTarget {
    case from
    case to
}

struct RouterScreen: View {
    @AppStorage(MapipConfig.baseURLKey) private var serverURL = MapipConfig.defaultBaseURL
    @StateObject private var auth = MapAuthModel()
    @State private var showLogin = false
    @State private var showAddObject = false
    @State private var showSettingsSheet = false
    @State private var fromText = ""
    @State private var toText = ""
    @State private var profile = "wheelchair"
    @State private var alternatives = 3
    @State private var message: String?
    @State private var error: String?
    @State private var lines: [RouteLine] = []
    @State private var objects: [MapObjectDTO] = []
    @State private var fromSuggestions: [GeocodeHit] = []
    @State private var toSuggestions: [GeocodeHit] = []
    @State private var fromSuggestVersion = 0
    @State private var toSuggestVersion = 0
    /// Не запускать подсказки после выбора точки на карте / из списка / объекта (иначе `onChange` снова дергает геокод).
    @State private var suppressFromSuggestionsOnNextTextChange = false
    @State private var suppressToSuggestionsOnNextTextChange = false
    @State private var position: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 51.533557, longitude: 46.034257),
            span: MKCoordinateSpan(latitudeDelta: 0.06, longitudeDelta: 0.06)
        )
    )
    @State private var fromPoint: CLLocationCoordinate2D?
    @State private var toPoint: CLLocationCoordinate2D?
    @StateObject private var locationProvider = LocationProvider()
    @State private var mapPickTarget: MapPickTarget?
    @State private var useCurrentLocationAsFrom = false
    @State private var selectedObject: MapObjectDTO?
    @State private var navigationMode = false
    @State private var navigationRoute: [CLLocationCoordinate2D] = []
    @State private var overpassPoints: [OverpassPoint] = []
    @State private var routeSteps: [RouteInstructionStep] = []
    @State private var routeSummary: String?
    @State private var wheelchairLongWarning = false
    /// Текущий видимый регион карты — для отсечения и прореживания маркеров при отдалении.
    @State private var mapRegion: MKCoordinateRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 51.533557, longitude: 46.034257),
        span: MKCoordinateSpan(latitudeDelta: 0.06, longitudeDelta: 0.06)
    )
    /// Кэш маркеров: пересчитывается только после жеста карты / загрузки данных, не на каждый `body`.
    @State private var displayedMapObjects: [MapObjectDTO] = []
    @State private var displayedOverpassPoints: [OverpassPoint] = []
    @State private var lastLiveLocationApplied: CLLocationCoordinate2D?

    private let overlayPanelMaxHeight: CGFloat = 280
    private let settingsFabLift: CGFloat = 296

    private var hasRouteInstructions: Bool {
        !routeSteps.isEmpty || routeSummary != nil
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottomTrailing) {
                VStack(spacing: 0) {
                    mapPanel
                    bottomOverlayPanel
                }

                Button {
                    showSettingsSheet = true
                } label: {
                    Image(systemName: "gearshape.fill")
                        .font(.title2)
                        .foregroundStyle(.primary)
                        .frame(width: 52, height: 52)
                        .background(.ultraThinMaterial, in: Circle())
                        .overlay(Circle().stroke(Color(.systemGray4), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Настройки")
                .padding(.trailing, 14)
                .padding(.bottom, settingsFabLift)
            }
            .navigationTitle("Маршрутизатор")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await loadObjects()
                await auth.refresh()
            }
            .onChange(of: serverURL) { _, _ in
                Task {
                    await auth.refresh()
                    await loadObjects()
                }
            }
            .onAppear {
                locationProvider.start()
                refreshDisplayedAnnotations(for: mapRegion)
            }
            .onChange(of: navigationMode) { _, on in
                locationProvider.setHighAccuracyNavigationMode(on)
            }
            .onChange(of: useCurrentLocationAsFrom) { _, on in
                if on { lastLiveLocationApplied = nil }
            }
            .onReceive(locationProvider.$currentLocation) { loc in
                guard useCurrentLocationAsFrom, let loc else { return }
                if let prev = lastLiveLocationApplied {
                    let a = CLLocation(latitude: prev.latitude, longitude: prev.longitude)
                    let b = CLLocation(latitude: loc.latitude, longitude: loc.longitude)
                    if a.distance(from: b) < 18 { return }
                }
                lastLiveLocationApplied = loc
                applyFromSelection(
                    text: String(format: "%.6f, %.6f", loc.latitude, loc.longitude),
                    coordinate: loc,
                )
            }
            .sheet(isPresented: $showSettingsSheet) {
                settingsSheet
            }
            .sheet(isPresented: $showLogin) {
                LoginSheet(auth: auth) { showLogin = false }
            }
            .sheet(isPresented: $showAddObject) {
                if let u = auth.user {
                    AddObjectView(
                        user: u,
                        onSuccess: {
                            showAddObject = false
                            Task { await loadObjects(); await auth.refresh() }
                        },
                        onDismiss: { showAddObject = false },
                    )
                } else {
                    Text("Сначала войдите в аккаунт.")
                        .padding()
                }
            }
            .sheet(item: $selectedObject) { obj in
                objectDetailSheet(obj)
            }
            .fullScreenCover(isPresented: $navigationMode) {
                NavigationFollowView(
                    route: navigationRoute,
                    locationProvider: locationProvider,
                    onClose: { navigationMode = false },
                )
            }
        }
    }

    private var bottomOverlayPanel: some View {
        VStack(spacing: 8) {
            ScrollView {
                VStack(spacing: 10) {
                    controlsPanel
                    routeInstructionsPanel
                    statusPanel
                }
                .padding(10)
            }
            .scrollIndicators(.hidden)
            .frame(maxHeight: overlayPanelMaxHeight)
        }
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(.systemGray4), lineWidth: 1))
        .padding(.horizontal, 10)
        .padding(.bottom, 6)
    }

    private var settingsSheet: some View {
        NavigationStack {
            Form {
                if auth.loading {
                    Section {
                        HStack {
                            ProgressView()
                            Text("Загрузка…")
                        }
                    }
                } else if let u = auth.user {
                    Section("Аккаунт") {
                        LabeledContent("Имя") {
                            Text((u.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "—" : (u.name ?? ""))
                                .multilineTextAlignment(.trailing)
                        }
                        LabeledContent("Email") {
                            Text(u.email ?? "—")
                                .textSelection(.enabled)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                }
                Section("Действия") {
                    Button {
                        showSettingsSheet = false
                        if auth.user != nil {
                            showAddObject = true
                        } else {
                            showLogin = true
                        }
                    } label: {
                        Label("Добавить объект", systemImage: "plus.circle")
                    }
                    if auth.user != nil {
                        Button(role: .destructive) {
                            showSettingsSheet = false
                            Task { await auth.logout() }
                        } label: {
                            Label("Выйти", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    } else {
                        Button {
                            showSettingsSheet = false
                            showLogin = true
                        } label: {
                            Label("Войти или регистрация", systemImage: "person.crop.circle.badge.plus")
                        }
                    }
                }
                Section("URL сервера") {
                    TextField("https://host:port", text: $serverURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .navigationTitle("Настройки")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Готово") {
                        MapipConfig.baseURLString = serverURL
                        showSettingsSheet = false
                    }
                }
            }
        }
    }

    private func refreshDisplayedAnnotations(for region: MKCoordinateRegion) {
        let span = max(region.span.latitudeDelta, region.span.longitudeDelta)
        let inView = objects.filter { region.containsCoordinate(lat: $0.x, lon: $0.y) }
        let maxCount: Int
        if span > 0.22 {
            maxCount = 16
        } else if span > 0.10 {
            maxCount = 36
        } else if span > 0.045 {
            maxCount = 72
        } else {
            maxCount = 160
        }
        displayedMapObjects = spatialSample(inView, maxCount: maxCount, around: region.center)

        if span < 0.09 {
            let inVO = overpassPoints.filter { region.containsCoordinate(lat: $0.lat, lon: $0.lon) }
            let cap = span < 0.035 ? 48 : 24
            displayedOverpassPoints = spatialSampleOverpass(inVO, maxCount: cap, around: region.center)
        } else {
            displayedOverpassPoints = []
        }
    }

    private func spatialSample(_ items: [MapObjectDTO], maxCount: Int, around center: CLLocationCoordinate2D) -> [MapObjectDTO] {
        guard items.count > maxCount, maxCount > 0 else { return items }
        let sorted = items.sorted { dist2MapObject($0, center) < dist2MapObject($1, center) }
        let step = max(1, sorted.count / maxCount)
        return Swift.stride(from: 0, to: sorted.count, by: step).prefix(maxCount).map { sorted[$0] }
    }

    private func spatialSampleOverpass(_ items: [OverpassPoint], maxCount: Int, around center: CLLocationCoordinate2D) -> [OverpassPoint] {
        guard items.count > maxCount, maxCount > 0 else { return items }
        let sorted = items.sorted { dist2Overpass($0, center) < dist2Overpass($1, center) }
        let step = max(1, sorted.count / maxCount)
        return Swift.stride(from: 0, to: sorted.count, by: step).prefix(maxCount).map { sorted[$0] }
    }

    private func dist2MapObject(_ o: MapObjectDTO, _ c: CLLocationCoordinate2D) -> Double {
        let dLat = o.x - c.latitude
        let dLon = o.y - c.longitude
        return dLat * dLat + dLon * dLon
    }

    private func dist2Overpass(_ p: OverpassPoint, _ c: CLLocationCoordinate2D) -> Double {
        let dLat = p.lat - c.latitude
        let dLon = p.lon - c.longitude
        return dLat * dLat + dLon * dLon
    }

    private var controlsPanel: some View {
        VStack(spacing: 10) {
            fromField
            toField
            HStack(spacing: 8) {
                profilePicker
                alternativesPicker
            }
            HStack(spacing: 8) {
                Button("Построить") {
                    Task { await build() }
                }
                .buttonStyle(.borderedProminent)

                Button("Навигация") {
                    navigationRoute = lines.first?.coordinates ?? []
                    navigationMode = true
                }
                .buttonStyle(.bordered)
                .disabled(lines.isEmpty)
            }
            Toggle("Использовать текущее местоположение для «Откуда»", isOn: $useCurrentLocationAsFrom)
                .font(.caption)
        }
    }

    @ViewBuilder
    private var statusPanel: some View {
        if let error {
            Text(error).foregroundStyle(.red).font(.caption).padding(.horizontal)
        }
        if let message {
            Text(message).font(.caption).foregroundStyle(.secondary).padding(.horizontal)
        }
    }

    private var mapPanel: some View {
        MapReader { proxy in
            Map(position: $position) {
                UserAnnotation()
                if let from = fromPoint {
                    Annotation("Старт", coordinate: from) { Circle().fill(.blue).frame(width: 11, height: 11) }
                }
                if let to = toPoint {
                    Annotation("Финиш", coordinate: to) { Circle().fill(.red).frame(width: 11, height: 11) }
                }
                ForEach(displayedMapObjects) { o in
                    Annotation(o.display_name, coordinate: CLLocationCoordinate2D(latitude: o.x, longitude: o.y)) {
                        Button {
                            selectedObject = o
                        } label: {
                            Image(systemName: "mappin.circle.fill")
                                .font(.title2)
                                .symbolRenderingMode(.multicolor)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(o.display_name)
                    }
                }
                ForEach(displayedOverpassPoints) { p in
                    Annotation(p.title, coordinate: CLLocationCoordinate2D(latitude: p.lat, longitude: p.lon)) {
                        Circle()
                            .fill(.orange)
                            .frame(width: 8, height: 8)
                            .overlay(Circle().stroke(Color.black.opacity(0.35), lineWidth: 1))
                    }
                }
                ForEach(lines) { line in
                    MapPolyline(coordinates: line.coordinates)
                        .stroke(colorForRoute(index: line.index), lineWidth: line.index == 0 ? 6 : 4)
                }
            }
            .onMapCameraChange(frequency: .onEnd) { context in
                mapRegion = context.region
                refreshDisplayedAnnotations(for: context.region)
            }
            .onTapGesture { p in
                guard let target = mapPickTarget else { return }
                guard let coord = proxy.convert(p, from: .local) else { return }
                if target == .from {
                    applyFromSelection(
                        text: String(format: "%.6f, %.6f", coord.latitude, coord.longitude),
                        coordinate: coord,
                    )
                } else {
                    applyToSelection(
                        text: String(format: "%.6f, %.6f", coord.latitude, coord.longitude),
                        coordinate: coord,
                    )
                }
                mapPickTarget = nil
            }
            .mapStyle(.standard(elevation: .realistic))
            .mapControls {
                MapCompass()
                MapUserLocationButton()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func applyFromSelection(text: String, coordinate: CLLocationCoordinate2D) {
        suppressFromSuggestionsOnNextTextChange = true
        fromText = text
        fromPoint = coordinate
        fromSuggestions = []
    }

    private func applyToSelection(text: String, coordinate: CLLocationCoordinate2D) {
        suppressToSuggestionsOnNextTextChange = true
        toText = text
        toPoint = coordinate
        toSuggestions = []
    }

    @ViewBuilder
    private var routeInstructionsPanel: some View {
        if hasRouteInstructions {
            VStack(alignment: .leading, spacing: 8) {
                Text("Пошагово").font(.caption.weight(.semibold))
                if wheelchairLongWarning {
                    Text("Внимание: для коляски маршрут длиннее 7 км или дольше 45 минут — оцените силы.")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.orange.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                if let routeSummary {
                    Text(routeSummary).font(.caption2).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(routeSteps) { step in
                        HStack(alignment: .top, spacing: 6) {
                            Text(step.text).font(.caption2)
                            Spacer(minLength: 4)
                            if let d = step.distanceM, d > 0 {
                                Text("\(Int(round(d))) м")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private var fromField: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                TextField("Откуда", text: $fromText)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 9))
                    .onChange(of: fromText) { _, new in
                        if suppressFromSuggestionsOnNextTextChange {
                            suppressFromSuggestionsOnNextTextChange = false
                            return
                        }
                        fromSuggestVersion += 1
                        let version = fromSuggestVersion
                        toSuggestions = []
                        Task { await updateSuggestions(query: new, target: .from, version: version) }
                    }

                Button(mapPickTarget == .from ? "На карте…" : "На карте") {
                    mapPickTarget = mapPickTarget == .from ? nil : .from
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(useCurrentLocationAsFrom)
            }
            if !fromSuggestions.isEmpty {
                suggestionList(fromSuggestions) { hit in
                    applyFromSelection(
                        text: hit.display_name,
                        coordinate: CLLocationCoordinate2D(latitude: hit.lat, longitude: hit.lon),
                    )
                }
            }
        }
    }

    private var toField: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                TextField("Куда", text: $toText)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 9))
                    .onChange(of: toText) { _, new in
                        if suppressToSuggestionsOnNextTextChange {
                            suppressToSuggestionsOnNextTextChange = false
                            return
                        }
                        toSuggestVersion += 1
                        let version = toSuggestVersion
                        fromSuggestions = []
                        Task { await updateSuggestions(query: new, target: .to, version: version) }
                    }

                Button(mapPickTarget == .to ? "На карте…" : "На карте") {
                    mapPickTarget = mapPickTarget == .to ? nil : .to
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            if !toSuggestions.isEmpty {
                suggestionList(toSuggestions) { hit in
                    applyToSelection(
                        text: hit.display_name,
                        coordinate: CLLocationCoordinate2D(latitude: hit.lat, longitude: hit.lon),
                    )
                }
            }
        }
    }

    private var profilePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Профиль маршрута").font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 8) {
                profileChip(tag: "wheelchair", systemImage: "figure.roll", title: "Колясочный")
                profileChip(tag: "foot-walking", systemImage: "figure.walk", title: "Пешком")
                profileChip(tag: "driving-car", systemImage: "car.fill", title: "Авто")
            }
        }
    }

    private func profileChip(tag: String, systemImage: String, title: String) -> some View {
        Button {
            profile = tag
        } label: {
            VStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.title2)
                    .symbolRenderingMode(.hierarchical)
                Text(title).font(.caption2)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(profile == tag ? Color.blue.opacity(0.15) : Color(.systemGray6))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(profile == tag ? Color.blue : Color.clear, lineWidth: 2))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private var alternativesPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Вариантов маршрута").font(.caption).foregroundStyle(.secondary)
            Picker("Вариантов маршрута", selection: $alternatives) {
                Text("1").tag(1)
                Text("2").tag(2)
                Text("3").tag(3)
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    @ViewBuilder
    private func suggestionList(_ hits: [GeocodeHit], onTap: @escaping (GeocodeHit) -> Void) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(hits.prefix(5).enumerated()), id: \.offset) { _, hit in
                    Button {
                        onTap(hit)
                    } label: {
                        Text(hit.display_name)
                            .font(.caption)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    Divider()
                }
            }
        }
        .padding(8)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .frame(maxHeight: 120)
        .zIndex(5)
    }

    private func colorForRoute(index: Int) -> Color {
        switch index {
        case 0: return .green
        case 1: return .yellow
        case 2: return .red
        default: return .gray
        }
    }

    private enum SuggestTarget { case from, to }

    private func localSuggestions(for term: String) -> [GeocodeHit] {
        let q = term.lowercased()
        return objects
            .filter { $0.display_name.lowercased().contains(q) || $0.adress.lowercased().contains(q) }
            .prefix(5)
            .map { GeocodeHit(lat: $0.x, lon: $0.y, display_name: $0.display_name) }
    }

    @MainActor
    private func updateSuggestions(query: String, target: SuggestTarget, version: Int) async {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if term.count < 2 {
            if target == .from { fromSuggestions = [] } else { toSuggestions = [] }
            return
        }
        let local = localSuggestions(for: term)
        do {
            let remote = try await MapipAPI.shared.geocode(query: term)
            if target == .from, version != fromSuggestVersion { return }
            if target == .to, version != toSuggestVersion { return }
            var merged = local
            for h in remote {
                if !merged.contains(where: { $0.display_name == h.display_name }) {
                    merged.append(h)
                }
                if merged.count >= 7 { break }
            }
            if target == .from { fromSuggestions = merged } else { toSuggestions = merged }
        } catch {
            if target == .from, version != fromSuggestVersion { return }
            if target == .to, version != toSuggestVersion { return }
            if target == .from { fromSuggestions = local } else { toSuggestions = local }
        }
    }

    private func build() async {
        error = nil
        message = nil
        lines = []
        overpassPoints = []
        routeSteps = []
        routeSummary = nil
        wheelchairLongWarning = false
        fromSuggestions = []
        toSuggestions = []
        guard !fromText.isEmpty, !toText.isEmpty else {
            error = "Заполните оба поля"
            return
        }
        do {
            let resolvedFrom: CLLocationCoordinate2D
            if useCurrentLocationAsFrom, let current = locationProvider.currentLocation {
                resolvedFrom = current
                applyFromSelection(
                    text: String(format: "%.6f, %.6f", current.latitude, current.longitude),
                    coordinate: current,
                )
            } else if let fromPoint {
                resolvedFrom = fromPoint
            } else {
                let a = try await MapipAPI.shared.geocode(query: fromText)
                guard let fa = a.first else {
                    error = "Точка «Откуда» не найдена"
                    return
                }
                resolvedFrom = CLLocationCoordinate2D(latitude: fa.lat, longitude: fa.lon)
                fromPoint = resolvedFrom
            }

            let resolvedTo: CLLocationCoordinate2D
            if let toPoint {
                resolvedTo = toPoint
            } else {
                let b = try await MapipAPI.shared.geocode(query: toText)
                guard let fb = b.first else {
                    error = "Точка «Куда» не найдена"
                    return
                }
                resolvedTo = CLLocationCoordinate2D(latitude: fb.lat, longitude: fb.lon)
                toPoint = resolvedTo
            }

            let data = try await MapipAPI.shared.buildRoute(
                from: [resolvedFrom.latitude, resolvedFrom.longitude],
                to: [resolvedTo.latitude, resolvedTo.longitude],
                profile: profile,
                alternativeCount: alternatives
            )
            routeSteps = decodeInstructionSteps(from: data)
            routeSummary = decodeRouteSummary(from: data)
            wheelchairLongWarning = decodeWheelchairLongWarning(from: data, profile: profile)
            var decoded = try decodeLines(from: data)
            if decoded.count < alternatives, let first = decoded.first, first.count >= 2 {
                let bbox = bboxString(for: first)
                if let bbox {
                    let overpassPts = (try? await MapipAPI.shared.overpassPoints(bbox: bbox, profile: profile)) ?? []
                    overpassPoints = overpassPts
                    let overpassCandidates = pickViaCandidates(base: first, points: overpassPts, maxCount: 8)
                    let candidates = dedupViaCandidates(overpassCandidates, maxCount: 8)
                    for via in candidates {
                        if decoded.count >= alternatives { break }
                        guard let viaLL = corridorViaFromPoi(base: first, poi: via, variant: decoded.count) else { continue }
                        let viaData = try await MapipAPI.shared.buildRoute(
                            from: [resolvedFrom.latitude, resolvedFrom.longitude],
                            to: [resolvedTo.latitude, resolvedTo.longitude],
                            profile: profile,
                            alternativeCount: 1,
                            via: [viaLL.0, viaLL.1]
                        )
                        let viaLines = try decodeLines(from: viaData)
                        guard let line = viaLines.first else { continue }
                        if isTooSimilarLine(line, toAny: decoded) { continue }
                        decoded.append(line)
                    }
                }
            }
            lines = decoded.enumerated().map { idx, line in
                RouteLine(coordinates: line.map { CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) }, index: idx)
            }
            if let reg = boundingRegion(for: lines.flatMap(\.coordinates)) {
                position = .region(reg)
                mapRegion = reg
                refreshDisplayedAnnotations(for: reg)
            }
            var msg = "Маршрутов: \(lines.count)"
            if lines.count < alternatives {
                msg += ". Сервис вернул меньше альтернатив, чем запрошено."
            }
            message = msg
        } catch {
            self.error = String(describing: error)
        }
    }

    @ViewBuilder
    private func objectDetailSheet(_ o: MapObjectDTO) -> some View {
        NavigationStack {
            Form {
                Section {
                    Text(o.display_name).font(.title3)
                    LabeledContent("Адрес", value: o.adress)
                    LabeledContent("Тип", value: o.type)
                }
                Section("Маршрут") {
                    Button("Откуда") {
                        applyFromSelection(
                            text: o.display_name,
                            coordinate: CLLocationCoordinate2D(latitude: o.x, longitude: o.y),
                        )
                        selectedObject = nil
                    }
                    Button("Куда") {
                        applyToSelection(
                            text: o.display_name,
                            coordinate: CLLocationCoordinate2D(latitude: o.x, longitude: o.y),
                        )
                        selectedObject = nil
                    }
                }
            }
            .navigationTitle("Объект")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Закрыть") { selectedObject = nil }
                }
            }
        }
    }

    private func loadObjects() async {
        do {
            objects = try await MapipAPI.shared.fetchMapObjects()
        } catch {
            objects = []
        }
        refreshDisplayedAnnotations(for: mapRegion)
    }
}

private extension MKCoordinateRegion {
    func containsCoordinate(lat: Double, lon: Double) -> Bool {
        let latMin = center.latitude - span.latitudeDelta / 2
        let latMax = center.latitude + span.latitudeDelta / 2
        let lonMin = center.longitude - span.longitudeDelta / 2
        let lonMax = center.longitude + span.longitudeDelta / 2
        return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax
    }
}

private struct RouteInstructionStep: Identifiable {
    let id = UUID()
    let text: String
    let distanceM: Double?
}

private func decodeInstructionSteps(from data: Data) -> [RouteInstructionStep] {
    guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let features = obj["features"] as? [[String: Any]],
          let first = features.first,
          let props = first["properties"] as? [String: Any],
          let segments = props["segments"] as? [[String: Any]] else {
        return []
    }
    var out: [RouteInstructionStep] = []
    for seg in segments {
        guard let steps = seg["steps"] as? [[String: Any]] else { continue }
        for st in steps {
            guard let ins = st["instruction"] as? String, !ins.isEmpty else { continue }
            let d = st["distance"] as? Double
            out.append(RouteInstructionStep(text: ins, distanceM: d))
        }
    }
    return out
}

private func decodeRouteSummary(from data: Data) -> String? {
    guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let features = obj["features"] as? [[String: Any]],
          let first = features.first,
          let props = first["properties"] as? [String: Any],
          let summary = props["summary"] as? [String: Any] else {
        return nil
    }
    let dist = summary["distance"] as? Double ?? 0
    let dur = summary["duration"] as? Double ?? 0
    if dist <= 0 && dur <= 0 { return nil }
    let km = dist / 1000
    let min = Int(round(dur / 60))
    return String(format: "~%.1f км, ~%d мин", km, min)
}

private func decodeWheelchairLongWarning(from data: Data, profile: String) -> Bool {
    guard profile == "wheelchair",
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let features = obj["features"] as? [[String: Any]],
          let first = features.first,
          let props = first["properties"] as? [String: Any],
          let summary = props["summary"] as? [String: Any] else {
        return false
    }
    let dist = summary["distance"] as? Double ?? 0
    let dur = summary["duration"] as? Double ?? 0
    return dist > 7000 || dur > 45 * 60
}

private func decodeLines(from data: Data) throws -> [[[Double]]] {
    let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let features = obj?["features"] as? [[String: Any]] ?? []
    var out: [[[Double]]] = []
    for f in features {
        guard let geom = f["geometry"] as? [String: Any] else { continue }
        if geom["type"] as? String == "LineString",
           let c = geom["coordinates"] as? [[Double]] {
            out.append(c.map { [$0[1], $0[0]] })
        }
    }
    return out
}

private func bboxString(for line: [[Double]]) -> String? {
    guard !line.isEmpty else { return nil }
    var minLat = line[0][0], maxLat = line[0][0]
    var minLon = line[0][1], maxLon = line[0][1]
    for p in line {
        minLat = min(minLat, p[0]); maxLat = max(maxLat, p[0])
        minLon = min(minLon, p[1]); maxLon = max(maxLon, p[1])
    }
    return "\(minLon),\(minLat),\(maxLon),\(maxLat)"
}

private func pickViaCandidates(base: [[Double]], points: [OverpassPoint], maxCount: Int) -> [OverpassPoint] {
    guard base.count >= 2 else { return [] }
    let ranked = points.compactMap { p -> (OverpassPoint, Double, Double)? in
        guard let foot = nearestFootOnPolyline(base, p.lat, p.lon) else { return nil }
        let progress = foot.progress
        guard progress > 0.12 && progress < 0.88 else { return nil }
        return (p, foot.distSq, progress)
    }
    .sorted { $0.1 < $1.1 }

    var out: [OverpassPoint] = []
    var used: [Double] = []
    for (p, _, progress) in ranked {
        if out.count >= maxCount { break }
        if used.contains(where: { abs($0 - progress) < 0.05 }) { continue }
        used.append(progress)
        out.append(p)
    }
    return out
}

private func dedupViaCandidates(_ points: [OverpassPoint], maxCount: Int) -> [OverpassPoint] {
    var out: [OverpassPoint] = []
    for p in points {
        if out.count >= maxCount { break }
        let tooNear = out.contains { sqDist($0.lat, $0.lon, p.lat, p.lon) < 0.00018 * 0.00018 }
        if tooNear { continue }
        out.append(p)
    }
    return out
}

private func sqDist(_ aLat: Double, _ aLon: Double, _ bLat: Double, _ bLon: Double) -> Double {
    let dLat = aLat - bLat
    let dLon = aLon - bLon
    return dLat * dLat + dLon * dLon
}

private func isTooSimilarLine(_ candidate: [[Double]], toAny existing: [[[Double]]]) -> Bool {
    existing.contains { overlap(candidate, $0) >= 0.9 && overlap($0, candidate) >= 0.9 }
}

private func overlap(_ a: [[Double]], _ b: [[Double]], samples: Int = 30) -> Double {
    guard a.count > 1, b.count > 1 else { return 1 }
    var close = 0
    for i in 0 ..< samples {
        let idx = min(a.count - 1, Int(round((Double(i) / Double(max(samples - 1, 1))) * Double(a.count - 1))))
        let p = a[idx]
        let d = nearestDistMeters(from: p, to: b)
        if d <= 14 { close += 1 }
    }
    return Double(close) / Double(samples)
}

private func nearestDistMeters(from p: [Double], to line: [[Double]]) -> Double {
    var best = Double.greatestFiniteMagnitude
    for q in line {
        let d = metersApprox(p[0], p[1], q[0], q[1])
        if d < best { best = d }
    }
    return best
}

private func metersApprox(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
    let dLat = (lat2 - lat1) * 111_320
    let dLon = (lon2 - lon1) * 111_320 * cos(((lat1 + lat2) / 2) * .pi / 180)
    return sqrt(dLat * dLat + dLon * dLon)
}

private func nearestFootOnPolyline(_ route: [[Double]], _ lat: Double, _ lon: Double) -> (lat: Double, lon: Double, distSq: Double, progress: Double)? {
    guard route.count >= 2 else { return nil }
    var bestSq = Double.greatestFiniteMagnitude
    var bestLat = lat
    var bestLon = lon
    var bestProgress = 0.0
    let n = route.count
    for i in 0 ..< (n - 1) {
        let a = route[i]
        let b = route[i + 1]
        let dx = b[1] - a[1]
        let dy = b[0] - a[0]
        let len2 = dx * dx + dy * dy
        if len2 < 1e-20 { continue }
        let t = max(0.0, min(1.0, ((lon - a[1]) * dx + (lat - a[0]) * dy) / len2))
        let plon = a[1] + t * dx
        let plat = a[0] + t * dy
        let d = sqDist(plat, plon, lat, lon)
        if d < bestSq {
            bestSq = d
            bestLat = plat
            bestLon = plon
            bestProgress = (Double(i) + t) / Double(n - 1)
        }
    }
    return (bestLat, bestLon, bestSq, bestProgress)
}

private func corridorViaFromPoi(base: [[Double]], poi: OverpassPoint, variant: Int) -> (Double, Double)? {
    guard let foot = nearestFootOnPolyline(base, poi.lat, poi.lon), base.count >= 2 else { return nil }
    let n = base.count
    let segIdx = min(n - 2, max(0, Int(floor(foot.progress * Double(n - 1)))))
    let a = base[segIdx]
    let b = base[segIdx + 1]
    let dx = b[1] - a[1]
    let dy = b[0] - a[0]
    let len = sqrt(dx * dx + dy * dy)
    if len < 1e-12 { return nil }
    let px = -dy / len
    let py = dx / len
    let lateralDeg = (0.00028 + Double(variant % 3) * 0.0001) * (variant % 2 == 0 ? 1 : -1)
    let towardBiases: [Double] = [0.08, 0.11, 0.14]
    let towardPoiBias = towardBiases[variant % towardBiases.count]
    var vLat = foot.lat + (poi.lat - foot.lat) * towardPoiBias
    var vLon = foot.lon + (poi.lon - foot.lon) * towardPoiBias
    vLat += px * lateralDeg
    vLon += py * lateralDeg
    return (vLat, vLon)
}

/// Полноэкранная «навигация»: камера следует за пользователем и разворачивается по курсу, линия маршрута сверху.
private struct NavigationFollowView: View {
    let route: [CLLocationCoordinate2D]
    @ObservedObject var locationProvider: LocationProvider
    let onClose: () -> Void

    @State private var position: MapCameraPosition = .automatic

    var body: some View {
        ZStack(alignment: .bottom) {
            Map(position: $position) {
                if route.count >= 2 {
                    MapPolyline(coordinates: route)
                        .stroke(Color.green, lineWidth: 8)
                }
                UserAnnotation()
            }
            .safeAreaPadding(.bottom, 130)
            .mapStyle(.standard(elevation: .realistic))
            .mapControls {
                MapCompass()
                MapUserLocationButton()
            }

            VStack(spacing: 10) {
                Text("Следуйте по зелёной линии. Камера ориентируется по вашему курсу.")
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                Button("Закрыть") {
                    onClose()
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
            .padding(.bottom, 6)
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial)
        }
        .onAppear(perform: syncCamera)
        .onReceive(locationProvider.$currentLocation) { _ in
            syncCamera()
        }
    }

    private func syncCamera() {
        if let u = locationProvider.currentLocation {
            let heading = locationProvider.course >= 0 ? locationProvider.course : 0
            position = .camera(
                MapCamera(
                    centerCoordinate: u,
                    distance: 420,
                    heading: heading,
                    pitch: 50,
                ),
            )
            return
        }
        guard let c = route.first else { return }
        position = .region(
            MKCoordinateRegion(
                center: c,
                span: MKCoordinateSpan(latitudeDelta: 0.025, longitudeDelta: 0.025),
            ),
        )
    }
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

