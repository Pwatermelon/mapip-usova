import Combine
import Foundation

@MainActor
final class MapAuthModel: ObservableObject {
    @Published var user: CurrentUserDTO?
    @Published var loading = false
    @Published var lastError: String?

    func refresh() async {
        loading = true
        defer { loading = false }
        do {
            user = try await MapipAPI.shared.currentUser()
            lastError = nil
        } catch {
            user = nil
        }
    }

    func login(email: String, password: String) async throws {
        try await MapipAPI.shared.login(email: email, password: password)
        await refresh()
    }

    func register(name: String, type: Int, email: String, password: String) async throws {
        try await MapipAPI.shared.register(name: name, type: type, email: email, password: password)
        try await login(email: email, password: password)
    }

    func logout() async {
        try? await MapipAPI.shared.logout()
        user = nil
    }
}
