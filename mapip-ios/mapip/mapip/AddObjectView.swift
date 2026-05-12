import CoreLocation
import MapKit
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Экран добавления объекта — те же поля и API, что у веб-страницы «Добавить информацию».
struct AddObjectView: View {
    let user: CurrentUserDTO
    var onSuccess: () -> Void
    var onDismiss: () -> Void

    @StateObject private var locationProvider = LocationProvider()

    @State private var baseType = "Социальная инфраструктура"
    @State private var selectedInfra = ""
    @State private var name = ""
    @State private var address = ""
    @State private var description = ""
    @State private var workingHours = ""
    @State private var coords: CLLocationCoordinate2D?
    @State private var addressSuggestions: [GeocodeHit] = []
    @State private var addressSuggestVersion = 0
    @State private var accessibilityOptions: [String] = []
    @State private var selectedAccessibility: Set<String> = []
    @State private var disability: Set<String> = []
    @State private var infraFlat: [String] = []
    @State private var msg: String?
    @State private var err: String?
    @State private var busy = false
    @State private var mapPick = false
    @State private var position: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 51.533557, longitude: 46.034257),
            span: MKCoordinateSpan(latitudeDelta: 0.06, longitudeDelta: 0.06),
        ),
    )
    @State private var selectedPhotos: [PhotosPickerItem] = []

    private let disabilityCodes = ["Г", "К", "О", "С", "У"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Пользователь") {
                    Text(user.email ?? "—")
                    if let s = user.score {
                        Text("Очки: \(s)")
                    }
                }
                Section("Тип") {
                    Picker("Тип объекта", selection: $baseType) {
                        Text("Транспортная инфраструктура").tag("Транспортная инфраструктура")
                        Text("Дорожная инфраструктура").tag("Дорожная инфраструктура")
                        Text("Социальная инфраструктура").tag("Социальная инфраструктура")
                    }
                    if baseType == "Социальная инфраструктура" {
                        Picker("Категория", selection: $selectedInfra) {
                            Text("Выберите категорию").tag("")
                            ForEach(infraFlat, id: \.self) { v in
                                Text(v).tag(v)
                            }
                        }
                    }
                }
                Section("Данные") {
                    TextField("Название", text: $name)
                    TextField("Адрес", text: $address)
                        .onChange(of: address) { _, new in
                            addressSuggestVersion += 1
                            let v = addressSuggestVersion
                            Task { await lookupAddress(q: new, version: v) }
                        }
                    if baseType == "Социальная инфраструктура" {
                        TextField("Описание", text: $description, axis: .vertical)
                            .lineLimit(3 ... 8)
                        TextField("График работы", text: $workingHours)
                    }
                }
                if !addressSuggestions.isEmpty {
                    Section("Подсказки адреса") {
                        ForEach(Array(addressSuggestions.enumerated()), id: \.offset) { _, s in
                            Button(s.display_name) {
                                address = s.display_name
                                coords = CLLocationCoordinate2D(latitude: s.lat, longitude: s.lon)
                                addressSuggestions = []
                            }
                        }
                    }
                }
                Section {
                    Toggle("Тап по карте выбирает точку", isOn: $mapPick)
                    mapBlock
                    Button("Моё местоположение") {
                        locationProvider.start()
                        if let loc = locationProvider.currentLocation {
                            coords = loc
                            address = String(format: "%.6f, %.6f", loc.latitude, loc.longitude)
                            addressSuggestions = []
                        } else {
                            err = "Сначала разрешите доступ к геолокации в настройках."
                        }
                    }
                    .font(.caption)
                } header: {
                    Text("Карта")
                }
                if baseType == "Социальная инфраструктура" {
                    Section("Элементы доступной среды") {
                        ForEach(accessibilityOptions, id: \.self) { a in
                            Toggle(a, isOn: bindingSet($selectedAccessibility, a))
                        }
                    }
                    Section("Категории инвалидности") {
                        ForEach(disabilityCodes, id: \.self) { code in
                            Toggle(code, isOn: bindingSet($disability, code))
                        }
                    }
                }
                Section("Фото") {
                    PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 6, matching: .images) {
                        Label("До 6 изображений", systemImage: "photo.on.rectangle.angled")
                    }
                }
                if let err {
                    Section {
                        Text(err).foregroundStyle(.red)
                    }
                }
                if let msg {
                    Section {
                        Text(msg).foregroundStyle(.green)
                    }
                }
            }
            .navigationTitle("Добавить объект")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { onDismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Отправить") { Task { await submit() } }
                        .disabled(busy)
                }
            }
            .task { await loadLists() }
            .onChange(of: baseType) { _, new in
                if new != "Социальная инфраструктура" {
                    selectedInfra = ""
                    selectedAccessibility = []
                    disability = []
                    description = ""
                    workingHours = ""
                }
            }
        }
    }

    private func bindingSet(_ set: Binding<Set<String>>, _ value: String) -> Binding<Bool> {
        Binding(
            get: { set.wrappedValue.contains(value) },
            set: { on in
                if on { set.wrappedValue.insert(value) } else { set.wrappedValue.remove(value) }
            },
        )
    }

    @ViewBuilder
    private var mapBlock: some View {
        MapReader { proxy in
            Map(position: $position) {
                UserAnnotation()
                if let c = coords {
                    Annotation("Точка", coordinate: c) {
                        Circle().fill(.red).frame(width: 14, height: 14)
                    }
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .onTapGesture { pt in
                guard mapPick, let c = proxy.convert(pt, from: .local) else { return }
                coords = c
                address = String(format: "%.6f, %.6f", c.latitude, c.longitude)
                addressSuggestions = []
            }
        }
    }

    private func loadLists() async {
        do {
            accessibilityOptions = try await MapipAPI.shared.fetchAccessibilityOptions()
        } catch {
            accessibilityOptions = []
        }
        do {
            let d = try await MapipAPI.shared.fetchInfrastructureDict()
            infraFlat = Array(Set(d.values.flatMap(\.self))).sorted()
        } catch {
            infraFlat = []
        }
    }

    private func lookupAddress(q: String, version: Int) async {
        let t = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.count < 3 {
            addressSuggestions = []
            return
        }
        do {
            let hits = try await MapipAPI.shared.geocode(query: t)
            if version != addressSuggestVersion { return }
            addressSuggestions = Array(hits.prefix(5))
        } catch {
            if version != addressSuggestVersion { return }
            addressSuggestions = []
        }
    }

    private func submit() async {
        err = nil
        msg = nil
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let a = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty, !a.isEmpty else {
            err = "Заполните название и адрес."
            return
        }
        if baseType == "Социальная инфраструктура" && selectedInfra.isEmpty {
            err = "Выберите категорию социальной инфраструктуры."
            return
        }
        let typeOut = baseType == "Социальная инфраструктура" ? (selectedInfra.isEmpty ? baseType : selectedInfra) : baseType

        var imageParts: [(data: Data, filename: String, mime: String)] = []
        for item in selectedPhotos {
            if let data = try? await item.loadTransferable(type: Data.self) {
                let ext = item.supportedContentTypes.first?.preferredFilenameExtension ?? "jpg"
                let mime = ext.lowercased() == "png" ? "image/png" : "image/jpeg"
                imageParts.append((data, "photo.\(ext)", mime))
            }
        }

        busy = true
        defer { busy = false }
        do {
            try await MapipAPI.shared.addMapObjectMultipart(
                name: n,
                address: a,
                type: typeOut,
                description: description,
                workingHours: workingHours,
                latitude: coords?.latitude,
                longitude: coords?.longitude,
                accessibility: Array(selectedAccessibility).sorted(),
                disabilityCategory: Array(disability).sorted(),
                imageParts: imageParts,
                userId: user.id,
            )
            msg = "Объект отправлен на модерацию."
            onSuccess()
        } catch {
            err = String(describing: error)
        }
    }
}
