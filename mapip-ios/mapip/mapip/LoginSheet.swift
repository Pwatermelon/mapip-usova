import SwiftUI

struct LoginSheet: View {
    @ObservedObject var auth: MapAuthModel
    var onClose: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var registerName = ""
    @State private var registerEmail = ""
    @State private var registerPassword = ""
    @State private var registerType = 0
    @State private var isRegister = false
    @State private var err: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Picker("Режим", selection: $isRegister) {
                    Text("Вход").tag(false)
                    Text("Регистрация").tag(true)
                }
                .pickerStyle(.segmented)
                if isRegister {
                    TextField("Имя", text: $registerName)
                    Picker("Категория доступности", selection: $registerType) {
                        Text("Нарушение слуха").tag(0)
                        Text("Коляска").tag(1)
                        Text("Опорно-двигательный").tag(2)
                        Text("Зрение").tag(3)
                        Text("Умственное развитие").tag(4)
                    }
                    TextField("Email", text: $registerEmail)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    SecureField("Пароль", text: $registerPassword)
                } else {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    SecureField("Пароль", text: $password)
                }
                if let err {
                    Text(err).foregroundStyle(.red)
                }
            }
            .navigationTitle(isRegister ? "Регистрация" : "Вход")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { onClose() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isRegister ? "Создать" : "Войти") { Task { await submit() } }
                        .disabled(busy)
                }
            }
        }
    }

    private func submit() async {
        err = nil
        busy = true
        defer { busy = false }
        do {
            if isRegister {
                let n = registerName.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !n.isEmpty else {
                    err = "Введите имя."
                    return
                }
                try await auth.register(
                    name: n,
                    type: registerType,
                    email: registerEmail,
                    password: registerPassword,
                )
            } else {
                try await auth.login(email: email, password: password)
            }
            onClose()
        } catch {
            err = String(describing: error)
        }
    }
}
