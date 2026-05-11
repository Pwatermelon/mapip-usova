"""Загрузка онтологии RDF/XML и SPARQL-запросы (совместимость с legacy MapApi / AccessibleRecommend)."""

from __future__ import annotations

import hashlib
import logging
import threading
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from rdflib import Graph, URIRef
from rdflib.exceptions import ParserError

log = logging.getLogger(__name__)

_ONTO_NS = "http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#"
_GRAPH: Graph | None = None
_GRAPH_PATH: Path | None = None
_LOCK = threading.Lock()


def _uri_to_label(uri: Any) -> str:
    s = unquote(str(uri))
    if _ONTO_NS in s:
        s = s.split(_ONTO_NS, 1)[-1]
    elif "#" in s:
        s = s.rsplit("#", 1)[-1]
    return s.replace("_", " ")


def load_graph(ontology_path: Path) -> Graph | None:
    global _GRAPH, _GRAPH_PATH
    path = ontology_path.resolve()
    if not path.is_file():
        log.warning("Файл онтологии не найден: %s", path)
        _GRAPH = None
        _GRAPH_PATH = None
        return None
    with _LOCK:
        if _GRAPH is not None and _GRAPH_PATH == path:
            return _GRAPH
        g = Graph()
        try:
            g.parse(path.as_posix(), format="xml")
        except ParserError:
            log.exception("Ошибка парсинга RDF/XML (ParserError)")
            _GRAPH = None
            _GRAPH_PATH = None
            return None
        except Exception:
            log.exception("Ошибка загрузки онтологии (не ParserError — например OSError, повреждённый XML)")
            _GRAPH = None
            _GRAPH_PATH = None
            return None
        _GRAPH = g
        _GRAPH_PATH = path
        log.info("Онтология загружена: %s (%s триплетов)", path, len(g))
        return _GRAPH


def get_graph(ontology_path: Path) -> Graph | None:
    if _GRAPH is not None and _GRAPH_PATH == ontology_path.resolve():
        return _GRAPH
    return load_graph(ontology_path)


def get_ontology_info(g: Graph, iri: str) -> dict[str, list[str]]:
    if not iri.strip():
        return {"categories": [], "accessibilityElements": []}
    try:
        node = URIRef(iri.strip())
    except Exception:
        return {"categories": [], "accessibilityElements": []}

    q1 = """
        PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>
        SELECT ?accessibilityElement WHERE {
            BIND(?iri AS ?individual)
            ?individual obj:имеет ?accessibilityElement .
        }
    """
    accessibility: list[str] = []
    for row in g.query(q1, initBindings={"iri": node}):
        for v in row:
            if v is not None:
                accessibility.append(_uri_to_label(v))

    q2 = """
        PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>
        SELECT ?category WHERE {
            BIND(?iri AS ?individual)
            VALUES (?property ?categoryLabel) {
                (obj:категория_Г "Г")
                (obj:категория_К "К")
                (obj:категория_С "С")
                (obj:категория_У "У")
                (obj:категория_О "О")
            }
            ?individual ?property true .
            BIND(?categoryLabel AS ?category)
        }
    """
    categories: list[str] = []
    for row in g.query(q2, initBindings={"iri": node}):
        for v in row:
            if v is not None:
                categories.append(str(v))

    return {"categories": categories, "accessibilityElements": accessibility}


def list_accessibility_elements(g: Graph) -> list[str]:
    q = """
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>
        SELECT ?subject WHERE { ?subject rdf:type obj:Элемент_доступной_среды . }
    """
    out: list[str] = []
    for row in g.query(q):
        for v in row:
            if v is not None:
                out.append(_uri_to_label(v))
    return sorted(set(out))


def ontology_object_id(iri: str) -> int:
    """Стабильный отрицательный id (не пересекается с положительными Id из PostgreSQL)."""
    h = int(hashlib.sha256(iri.encode("utf-8")).hexdigest()[:12], 16)
    return -(h % 900_000_000 + 1)


def _literal_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        return float(val)  # rdflib Literal
    except (TypeError, ValueError):
        pass
    s = str(val).split("^")[0].strip()
    try:
        return float(s)
    except ValueError:
        return None


def list_map_objects_from_ontology(g: Graph) -> list[dict[str, Any]]:
    """
    Индивиды с X, Y и типом (как legacy GET /GetOntologyObjects / SPARQL в SocialMapObjectController).
    Формат совпадает с map_object_to_json для фронта.
    """
    q = """
        PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>
        SELECT ?object ?x ?y ?type
        WHERE {
            ?object obj:X ?x .
            ?object obj:Y ?y .
            ?object obj:является ?type .
        }
    """
    out: list[dict[str, Any]] = []
    seen_iris: set[str] = set()
    for row in g.query(q):
        if len(row) < 4:
            continue
        obj_node, xv, yv, type_node = row[0], row[1], row[2], row[3]
        iri = str(obj_node)
        if iri in seen_iris:
            continue
        seen_iris.add(iri)
        x = _literal_float(xv)
        y = _literal_float(yv)
        if x is None or y is None:
            continue
        type_label = _uri_to_label(type_node)
        display = _uri_to_label(obj_node)
        oid = ontology_object_id(iri)
        out.append(
            {
                "id": oid,
                "x": x,
                "y": y,
                "display_name": display,
                "iri": iri,
                "adress": "Данные из онтологии",
                "description": None,
                "images": "Нет изображения",
                "type": type_label,
                "rating": None,
                "workingHours": None,
                "createdAt": None,
                "updatedAt": None,
            }
        )
    return out


def infrastructure_by_type(g: Graph) -> dict[str, list[str]]:
    q = """
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>
        SELECT ?type ?category
        WHERE {
            ?type rdfs:subClassOf obj:Объект_социальной_инфраструктуры .
            ?category rdf:type ?type .
        }
    """
    d: dict[str, list[str]] = {}
    for row in g.query(q):
        if len(row) < 2:
            continue
        type_name = _uri_to_label(row[0])
        cat_name = _uri_to_label(row[1])
        d.setdefault(type_name, []).append(cat_name)
    for k in d:
        d[k] = sorted(set(d[k]))
    return d
