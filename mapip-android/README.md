# mapip-android

Заготовка под нативное Android-приложение MAPIP.

Клиент должен вызывать те же HTTP API, что и веб и iOS:

- **Core** (данные карты, пользователи, комментарии): те же пути, что у `mapip-core` за nginx, например `/GetSocialMapObject`, `/api/...`.
- **Маршрутизация** (геокод + OpenRouteService): префикс `/routing/`, например `GET /routing/v1/geocode/search`, `POST /routing/v1/directions/geojson`.

Реализацию на Kotlin/Jetpack Compose можно добавить позже; бизнес-логика и UX остаются на сервере и в общих контрактах API.
