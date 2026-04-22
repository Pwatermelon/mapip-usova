# mapip-ios

Нативный клиент MAPIP на SwiftUI. Данные и маршруты — только через ваш backend (как у картографических SDK).

## Подключение в Xcode

1. **File → New → Project → App**, интерфейс SwiftUI, **минимальная версия iOS 17** (MapKit SwiftUI с полилинией).
2. В сгенерированном `App.swift` оставьте `@main` и укажите `WindowGroup { ContentView() }` (или переименуйте в `MapipApp` по желанию).
3. Перетащите папку `Sources/MapipApp` в проект (Create groups), отметьте target приложения. **Не добавляйте второй** `@main`.
4. В **Info** добавьте разрешение на сеть к вашему серверу: для отладки по HTTP в **Info.plist** можно временно добавить `App Transport Security` → `Exception Domains` → ваш хост с `NSExceptionAllowsInsecureHTTPLoads = YES` (только для dev).
5. В `MapipConfig.swift` задайте `baseURL` на ваш gateway (например `http://192.168.0.10:8088` или продакшен HTTPS).

## API

- Объекты: `GET {baseURL}/GetSocialMapObject`
- Маршрут: `POST {baseURL}/routing/v1/directions/geojson` с телом `{ "from": [lat,lon], "to": [lat,lon], "profile": "wheelchair" }`
- Геокод: `GET {baseURL}/routing/v1/geocode/search?q=...`

Сессия входа (`/api/users/login`) при необходимости — с сохранением cookie (`URLSessionConfiguration` с `httpCookieStorage`).
