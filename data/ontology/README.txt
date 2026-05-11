Здесь лежат дополнительные форматы онтологии (.owl, .ttl, catalog и т.д.) из легаси MapApi / MAPIP_old.

Рабочий RDF/XML для mapip-core (и для Docker) лежит рядом с бэкендом — закоммитьте его обязательно:

    mapip-core/data/ontology/Ontology_Social_objects_new.rdf

Сборка образа: см. mapip-core/Dockerfile (COPY из mapip-core/data/ontology/). После git pull:
    docker compose build mapip-core && docker compose up -d mapip-core
