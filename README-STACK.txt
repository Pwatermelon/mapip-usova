MAPIP — микросервисы
====================

Запуск: из каталога MAPIP
  export OPENROUTE_API_KEY=ваш_ключ   # openrouteservice.org
  docker compose up --build

Веб: http://localhost:8088
PostgreSQL: localhost:5432 (postgres / 12345, БД map)

Сервисы:
  mapip-web     — React + MapLibre, nginx проксирует /api и /routing
  mapip-core    — FastAPI, доменные данные (PostgreSQL)
  mapip-routing — FastAPI, ORS + Nominatim
  flask         — рекомендации/комментарии (MapApplication-master/FlaskApi)

Онтология (раньше лежала в MapApi): каталог data/ontology/

Локальная разработка Python: предпочтительно 3.12–3.13 (mapip-core/.python-version).

Деплой (GitHub Actions): в DEPLOY_PATH перед распаковкой — docker compose down, удаление
старых mapip-*, MapApplication-master, data и compose-файла, затем tar с нуля. Том БД не сносится (без -v).
