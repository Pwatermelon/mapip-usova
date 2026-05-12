# MAPIP — монорепозиторий

Все сервисы и клиенты лежат **в одном репозитории** (одна корневая папка `MAPIP/`), отдельный репозиторий только для iOS **не нужен**.

| Каталог | Назначение |
|--------|------------|
| `mapip-core` | FastAPI: пользователи, сессии, объекты карты, комментарии, маршруты, онтология, модерация, legacy `/client/AddMapObject` |
| `mapip-routing-service` | Геокодинг, маршруты (ORS), Overpass |
| `mapip-web` | React: карта, вход/регистрация, добавление информации, панель эксперта |
| **`mapip-ios`** | **SwiftUI-клиент** (тот же API, что веб и Android) |
| **`mapip-android`** | **Kotlin + Compose** — маршрутизатор, вход/регистрация, добавление объекта (см. `mapip-android/README.md`) |

iOS-проект открывайте так: `MAPIP/mapip-ios/mapip/mapip.xcodeproj` (подробнее в `mapip-ios/README.md`).
