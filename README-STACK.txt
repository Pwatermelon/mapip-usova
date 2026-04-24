MAPIP — микросервисы
====================

Единая точка входа для браузера
-------------------------------
Только контейнер **mapip-web** (nginx + собранный React). Все запросы к API идут с того же хоста и порта (относительные пути `/api`, `/routing`, …).

После `docker compose up --build`:
  http://localhost:8088/
  http://localhost:5000/   (тот же шлюз; удобно, если привыкли к старому порту 5000)

Не путать:
  * **mapip-core:8000** — только FastAPI (JSON, /docs). Это не «страница приложения».
  * Старый **ASP.NET MapApi** на :5000, если он всё ещё запущен отдельно — это другой процесс; остановите его или не публикуйте тот же порт.

На macOS порт **5000** иногда занят **AirPlay Receiver** — тогда либо отключите приём AirPlay в настройках, либо пользуйтесь только **8088**, либо уберите строку `"5000:80"` из `docker-compose.yml` у себя локально.

Запуск из каталога MAPIP
------------------------
  export OPENROUTE_API_KEY=ваш_ключ   # openrouteservice.org
  docker compose up --build

PostgreSQL: только внутри сети compose (хост: db, порт 5432). С хоста: docker compose exec db psql -U postgres -d map

Сервисы за nginx (для клиента один origin)
------------------------------------------
  mapip-web       — React + MapLibre; прокси: /api → mapip-core, /routing → mapip-routing, /comments и /recommendations → flask
  mapip-core      — карта, пользователи, избранное, комментарии в БД, маршруты из БД
  mapip-routing   — геокод + OpenRouteService
  flask           — модерация текста (/comments/…), рекомендации (/recommendations/…)

Онтология: data/ontology/

Локальная разработка Python: предпочтительно 3.12–3.13 (mapip-core/.python-version).

Деплой (GitHub Actions): в DEPLOY_PATH перед распаковкой — compose down, удаление
старых mapip-*, MapApplication-master, data и compose-файла, затем tar с нуля. Том БД не сносится (без -v).
На сервере: docker compose (плагин v2) или docker-compose (v1); если нет --no-cache в help — build --pull.
Плагин v2 на Ubuntu: sudo apt install docker-compose-plugin
