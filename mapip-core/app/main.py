from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.routers import comments, legacy, map_objects, routes_db, users

app = FastAPI(
    title="MAPIP Core API",
    description="Доменные данные карты, пользователи, комментарии, сохранённые маршруты.",
    version="1.0.0",
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
