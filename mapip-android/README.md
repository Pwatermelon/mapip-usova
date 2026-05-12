# MAPIP — Android (Compose)

Тот же backend, что у **mapip-web** и **mapip-ios**: `mapip-core` + `mapip-routing-service` через один базовый URL (как nginx на `8088`).

## Сборка сегодня

1. Установите [Android Studio](https://developer.android.com/studio) (Ladybug+).
2. **File → Open** → каталог `MAPIP/mapip-android`.
3. Создайте `mapip-android/local.properties` (шаблон: `local.properties.example`):
   - `sdk.dir=...` — Android Studio при первом запуске часто сама дописывает `sdk.dir`.
   - `MAPS_API_KEY=...` — ключ **Maps SDK for Android** из [Google Cloud Console](https://console.cloud.google.com/) (включите API «Maps SDK for Android» для проекта).
4. **Build → Make Project**, затем **Run** на эмуляторе или устройстве.

По умолчанию базовый URL **`http://10.0.2.2:8088`** (эмулятор → ваш `localhost` с портом nginx). На физическом устройстве в приложении: **Сервер** → IP компьютера в Wi‑Fi, например `http://192.168.1.5:8088`.

## Возможности (паритет с iOS)

- Карта Google Maps, объекты `GetSocialMapObject`, геокодинг, маршруты с альтернативами и Overpass‑добором, подсказки «Откуда/Куда», пикер точки на карте.
- Вход / регистрация (cookie-сессия), добавление объекта (`client/AddMapObject`) с фото, списки инфраструктуры и доступности с core.
- Полноэкранная «Навигация» по первому маршруту (линия + геолокация).

## GitHub Actions

Пуш **только** в `mapip-ios/**` или `mapip-android/**` не запускает workflow деплоя (см. `.github/workflows/deploy.yml` → `paths-ignore`).
