from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _discover_ontology_file() -> Path:
    """MAPIP/data/ontology (рядом с mapip-core) или mapip-core/data/ontology в образе."""
    here = Path(__file__).resolve().parent
    for base in (here.parent, here.parent.parent, here.parent.parent.parent):
        p = base / "data" / "ontology" / "Ontology_Social_objects_new.rdf"
        if p.is_file():
            return p
    return here.parent / "data" / "ontology" / "Ontology_Social_objects_new.rdf"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://postgres:12345@localhost:5432/map"
    session_secret: str = "change-me-in-production-use-long-random-string"
    ontology_path: Path = Field(
        default_factory=_discover_ontology_file,
        description="RDF/XML онтология (legacy). Переопределение: ONTOLOGY_PATH.",
    )


settings = Settings()
