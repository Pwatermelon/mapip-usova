Файлы онтологии перенесены сюда из легаси MapApi / MAPIP_old (те же RDF/OWL/TTL, что использовались в C# с VDS.RDF).

ВАЖНО ДЛЯ GIT И ДЕПЛОЯ
----------------------
1. Каталог data/ontology/ и файл Ontology_Social_objects_new.rdf должны быть ЗАКОММИЧЕНЫ в репозитории (не добавляйте их в .gitignore).
2. mapip-core в Docker собирается с контекстом КОРНЯ MAPIP (см. docker-compose.yml: context: ., dockerfile: mapip-core/Dockerfile).
   В образ копируется: data/ontology/Ontology_Social_objects_new.rdf → /app/data/ontology/
3. В контейнере задаётся ONTOLOGY_PATH=/app/data/ontology/Ontology_Social_objects_new.rdf (см. docker-compose environment).
4. После git pull на сервере пересоберите core, чтобы подтянуть онтологию из репо:
     docker compose build mapip-core && docker compose up -d mapip-core
   (при смене только RDF достаточно пересобрать mapip-core.)

Локальный запуск без Docker: mapip-core ищет файл в родительских каталогах (в т.ч. MAPIP/data/ontology/...), см. app/config.py.
