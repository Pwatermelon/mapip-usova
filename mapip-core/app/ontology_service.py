"""Загрузка онтологии RDF/XML и SPARQL-запросы (совместимость с legacy MapApi / AccessibleRecommend)."""

from __future__ import annotations

import hashlib
import logging
import threading
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from rdflib import Graph, Literal, URIRef
from rdflib.exceptions import ParserError
from rdflib.namespace import RDF, RDFS

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


def _literal_is_true(val: Any) -> bool:
    if val is None:
        return False
    if isinstance(val, Literal):
        try:
            return bool(val) and str(val).lower() not in ("false", "0", "")
        except Exception:
            return str(val).lower() in ("true", "1", "yes")
    return False


def get_ontology_info(g: Graph, iri: str) -> dict[str, list[str]]:
    if not iri.strip():
        return {"categories": [], "accessibilityElements": []}
    try:
        node = URIRef(iri.strip())
    except Exception:
        return {"categories": [], "accessibilityElements": []}

    p_has = URIRef(_ONTO_NS + "имеет")
    accessibility: list[str] = []
    for o in g.objects(node, p_has):
        accessibility.append(_uri_to_label(o))

    cat_props: list[tuple[URIRef, str]] = [
        (URIRef(_ONTO_NS + "категория_Г"), "Г"),
        (URIRef(_ONTO_NS + "категория_К"), "К"),
        (URIRef(_ONTO_NS + "категория_С"), "С"),
        (URIRef(_ONTO_NS + "категория_У"), "У"),
        (URIRef(_ONTO_NS + "категория_О"), "О"),
    ]
    categories: list[str] = []
    for prop, label in cat_props:
        for o in g.objects(node, prop):
            if _literal_is_true(o):
                categories.append(label)
            break

    return {"categories": categories, "accessibilityElements": accessibility}


def list_accessibility_elements(g: Graph) -> list[str]:
    cls = URIRef(_ONTO_NS + "Элемент_доступной_среды")
    out = [_uri_to_label(s) for s in g.subjects(RDF.type, cls)]
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

    Обход триплетов вместо SPARQL: rdflib 7 + pyparsing даёт TypeError на кириллице в префиксных
    именах вроде obj:является (Param.postParse2 missing tokenList).
    """
    p_x = URIRef(_ONTO_NS + "X")
    p_y = URIRef(_ONTO_NS + "Y")
    p_type = URIRef(_ONTO_NS + "является")
    by_subj: dict[Any, dict[str, Any]] = {}
    for s, p, o in g.triples((None, None, None)):
        if p == p_x:
            by_subj.setdefault(s, {})["x"] = o
        elif p == p_y:
            by_subj.setdefault(s, {})["y"] = o
        elif p == p_type:
            by_subj.setdefault(s, {})["type"] = o

    out: list[dict[str, Any]] = []
    seen_iris: set[str] = set()
    for obj_node, vals in by_subj.items():
        xv = vals.get("x")
        yv = vals.get("y")
        type_node = vals.get("type")
        if xv is None or yv is None or type_node is None:
            continue
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
    root = URIRef(_ONTO_NS + "Объект_социальной_инфраструктуры")
    d: dict[str, list[str]] = {}
    for type_uri in g.subjects(RDFS.subClassOf, root):
        type_name = _uri_to_label(type_uri)
        for cat in g.subjects(RDF.type, type_uri):
            d.setdefault(type_name, []).append(_uri_to_label(cat))
    for k in d:
        d[k] = sorted(set(d[k]))
    return d
