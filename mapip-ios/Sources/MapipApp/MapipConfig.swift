import Foundation

/// Базовый URL gateway (nginx с вебом и прокси на core + routing).
enum MapipConfig {
    /// Замените на адрес вашего сервера (Docker порт 8088 или продакшен).
    static var baseURL: URL = URL(string: "http://127.0.0.1:8088")!
}
