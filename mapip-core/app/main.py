from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.routers import comments, map_objects, routes_db, users

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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "mapip-core"}
