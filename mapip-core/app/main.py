from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.routers import comments, expert, legacy, map_objects, routes_db, statistics, users


def _migrate_db_for_ontology_object_ids(engine) -> None:
    """Старые БД: снять FK на MapObject, чтобы id из онтологии (отрицательные) в Comment/Favorite; колонка маршрута."""
    if engine.dialect.name != "postgresql":
        return
    from sqlalchemy import text

    stmts = [
        'ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "LinkedMapObjectId" INTEGER',
        'ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_MapObjectId_fkey"',
        'ALTER TABLE "Favorite" DROP CONSTRAINT IF EXISTS "Favorite_MapObjectID_fkey"',
    ]
    with engine.begin() as conn:
        for s in stmts:
            try:
                conn.execute(text(s))
            except Exception:
                pass


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import app.models  # noqa: F401 — регистрация моделей в Base.metadata
    from app.db import Base, SessionLocal, engine
    from app.models import AdminSetting, User
    from app.ontology_service import load_graph
    from app.pending_guest_user import seed_guest_submitter_if_needed

    Base.metadata.create_all(bind=engine)
    _migrate_db_for_ontology_object_ids(engine)
    db = SessionLocal()
    try:
        if db.query(AdminSetting).first() is None:
            db.add(
                AdminSetting(
                    RnValue=4,
                    ExcludedCategories="",
                    CronExpression="0 0 * * *",
                )
            )
            db.commit()
        seed_guest_submitter_if_needed(db)
        if settings.seed_dev_admin:
            email = settings.dev_admin_email.strip()
            if email and db.query(User).filter(User.Email == email).first() is None:
                db.add(
                    User(
                        Name="Администратор (dev)",
                        Type=1,
                        Email=email,
                        Password=settings.dev_admin_password,
                        Score=0,
                    )
                )
                db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
    load_graph(settings.ontology_path)
    yield


app = FastAPI(
    title="MAPIP Core API",
    description="Доменные данные карты, пользователи, комментарии, сохранённые маршруты.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(map_objects.router)
app.include_router(comments.router)
app.include_router(users.router)
app.include_router(routes_db.router)
app.include_router(legacy.router)
app.include_router(statistics.router)
app.include_router(expert.router)


@app.get("/")
def root() -> dict[str, str | list[str]]:
    """Прямой заход на :8000 — не UI; браузерный интерфейс только через mapip-web (nginx)."""
    return {
        "service": "mapip-core",
        "message": "Это backend JSON API. Веб-приложение (React) открывайте через контейнер mapip-web: http://localhost:8088/ или http://localhost:5000/ при пробросе портов из docker-compose.",
        "api_prefixes": [
            "GET /GetSocialMapObject",
            "GET /api/SocialMapObject/SearchBy/",
            "GET /api/SocialMapObject/GetSocialMapObjectById/{id}",
            "GET/POST /api/comment/...",
            "GET/POST /api/users/...",
            "GET /api/routes/GetRoutesWithDataStatus",
        ],
        "openapi": "/docs",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "mapip-core"}
