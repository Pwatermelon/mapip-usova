# mapip-ios

Нативный клиент **MAPIP** на SwiftUI. Код лежит **в том же Git-репозитории**, что `mapip-core`, `mapip-web` и `mapip-routing-service` (см. `../README.md` в каталоге `MAPIP/`). Отдельный репозиторий для iOS не предполагается.

## Возможности

- **Маршрутизатор** на Apple Maps: геокодинг, построение маршрута, подсказки, слой объектов с `GET …/GetSocialMapObject` (то же объединение БД и данных из онтологии, что отдаёт backend).
- **Вход и регистрация** (`MapAuthModel`, `LoginSheet`): cookie-сессия как у веба — `POST /api/users/login`, `POST /api/users/AddUser`, затем повторный вход; `GET /api/users/current-user`.
- **Добавление места на карту** (`AddObjectView`): после входа — `POST …/client/AddMapObject` с `userId` (заявка уходит на модерацию на стороне core). Списки для формы подтягиваются с backend:
  - `GET /api/admin/get/infrastructure` — категории социальной инфраструктуры из онтологии/админки;
  - `GET /api/SocialMapObject/get/accessibility` — варианты доступной среды.
- **Overpass** (маршрутизатор): `GET …/routing/v1/overpass/objects` — точки вдоль маршрута из внешнего Overpass API (это не замена онтологии объектов карты; основная карта — `GetSocialMapObject`).

## Открытие в Xcode

1. Откройте `mapip/mapip.xcodeproj`.
2. Минимальная версия **iOS 17** (MapKit SwiftUI, полилинии).
3. В target должен быть один `@main` в `mapipApp.swift`.
4. Для HTTP в dev в **Info** при необходимости добавьте исключение ATS для вашего хоста.
5. Базовый URL сервера задаётся в `MapipConfig.swift` и кнопкой **Сервер** в приложении.

## Файлы target (основные)

- `ContentView.swift` → `RouterScreen`
- `RouterScreen.swift` — карта, маршрут, объекты, вход/добавить
- `LoginSheet.swift` — вход | регистрация
- `AddObjectView.swift` — форма нового объекта
- `Services/MapipAPI.swift` — HTTP к core + routing
- `Services/MapAuthModel.swift` — состояние пользователя

## API (кратко)

| Действие | Метод |
|----------|--------|
| Объекты карты | `GET {base}/GetSocialMapObject` |
| Вход | `POST {base}/api/users/login` |
| Регистрация | `POST {base}/api/users/AddUser` |
| Текущий пользователь | `GET {base}/api/users/current-user` |
| Новый объект | `POST {base}/client/AddMapObject` (multipart) |
| Инфраструктура (онтология) | `GET {base}/api/admin/get/infrastructure` |
| Доступность | `GET {base}/api/SocialMapObject/get/accessibility` |
| Геокодинг | `GET {base}/routing/v1/geocode/search?q=…` |
| Маршрут | `POST {base}/routing/v1/directions/geojson` |
