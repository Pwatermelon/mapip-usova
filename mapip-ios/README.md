# mapip-ios

Клиент MAPIP на SwiftUI. В текущей версии приложение содержит нативный маршрутизатор на Apple Maps, но работает через те же backend API (`routing` + `core`) и поддерживает подсказки адресов.

## Подключение в Xcode

1. **File → New → Project → App**, интерфейс SwiftUI, **минимальная версия iOS 17** (MapKit SwiftUI с полилинией).
2. В сгенерированном `App.swift` оставьте `@main` и укажите `WindowGroup { ContentView() }` (или переименуйте в `MapipApp` по желанию).
3. Используйте папку target `mapip/mapip/`:
   - `ContentView.swift` (точка входа экрана),
   - `RouterScreen.swift`,
   - `MapipConfig.swift`,
   - `Services/MapipAPI.swift`.
   В проекте должен быть только один `@main` в `mapipApp.swift`.
4. В **Info** добавьте разрешение на сеть к вашему серверу: для отладки по HTTP в **Info.plist** можно временно добавить `App Transport Security` → `Exception Domains` → ваш хост с `NSExceptionAllowsInsecureHTTPLoads = YES` (только для dev).
5. В `MapipConfig.swift` по умолчанию стоит локальный адрес. В приложении есть кнопка `Сервер` для смены URL стенда.

## API

- Объекты карты: `GET {baseURL}/GetSocialMapObject`
- Подсказки: `GET {baseURL}/routing/v1/geocode/search?q=...`
- Маршруты: `POST {baseURL}/routing/v1/directions/geojson`

Сессия входа (`/api/users/login`) при необходимости — с сохранением cookie (`URLSessionConfiguration` с `httpCookieStorage`).
