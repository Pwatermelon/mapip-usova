"""Загрузка онтологии RDF/XML и SPARQL-запросы (совместимость с legacy MapApi / AccessibleRecommend)."""

from __future__ import annotations

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
        except ParserError as e:
            log.exception("Ошибка парсинга онтологии: %s", e)
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
