from typing import Any

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Comment, Favorite, MapObject, User
from app.serializers import map_object_to_json, user_public

router = APIRouter(prefix="/api/users", tags=["users"])


class LoginBody(BaseModel):
    email: str
    password: str


class RegisterBody(BaseModel):
    name: str
    type: int
    email: str
    password: str


@router.post("/login")
def login(request: Request, body: LoginBody, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = db.query(User).filter(User.Email == body.email).first()
    if not user:
        raise HTTPException(status_code=400, detail={"message": "Email неверный."})
    if user.Password != body.password:
        raise HTTPException(status_code=400, detail={"message": "Пароль неверный."})
    request.session["UserId"] = user.Id
    return {"success": True, "message": "Успешная аутентификация!", "userId": user.Id}


@router.get("/logout")
def logout(request: Request) -> dict[str, str]:
    request.session.clear()
    return {"message": "Вы вышли из системы!"}


@router.get("/current-user")
def current_user(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    uid = request.session.get("UserId")
    if uid is None:
        raise HTTPException(status_code=401, detail={"message": "Вы не авторизованы."})
    user = db.query(User).filter(User.Id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail={"message": "Пользователь не найден."})
    return user_public(user)


@router.post("/AddUser")
def register(body: RegisterBody, db: Session = Depends(get_db)) -> dict[str, str]:
    if db.query(User).filter(User.Email == str(body.email)).first():
        raise HTTPException(status_code=400, detail={"message": "Пользователь с таким email уже существует."})
    u = User(
        Name=body.name,
        Type=body.type,
        Email=body.email.strip(),
        Password=body.password,
        Score=0,
    )
    db.add(u)
    db.commit()
    return {"message": "Регистрация успешна!"}


@router.get("/GetLikesByUserId/{user_id}")
def likes(user_id: int, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    q = (
        db.query(MapObject)
        .join(Favorite, Favorite.MapObjectID == MapObject.Id)
        .filter(Favorite.UserID == user_id)
        .all()
    )
    if not q:
        raise HTTPException(status_code=404)
    return [map_object_to_json(m) for m in q]


@router.post("/AddFavorite")
def add_favorite(
    userID: int = Form(...),
    mapObjectID: int = Form(...),
    db: Session = Depends(get_db),
) -> str:
    if not db.query(User).filter(User.Id == userID).first():
        raise HTTPException(status_code=400, detail="Некорректный ID пользователя или объекта карты.")
    if not db.query(MapObject).filter(MapObject.Id == mapObjectID).first():
        raise HTTPException(status_code=400, detail="Некорректный ID пользователя или объекта карты.")
    if db.query(Favorite).filter(Favorite.UserID == userID, Favorite.MapObjectID == mapObjectID).first():
        return "Уже в избранном."
    db.add(Favorite(UserID=userID, MapObjectID=mapObjectID))
    db.commit()
    return "Элемент добавлен в избранное успешно."


@router.delete("/RemoveFavorite")
def remove_favorite(
    userID: int = Form(...),
    mapObjectID: int = Form(...),
    db: Session = Depends(get_db),
) -> str:
    f = (
        db.query(Favorite)
        .filter(Favorite.UserID == userID, Favorite.MapObjectID == mapObjectID)
        .first()
    )
    if not f:
        raise HTTPException(status_code=404, detail="Элемент не найден.")
    db.delete(f)
    db.commit()
    return "Элемент успешно удален из избранного."


@router.get("/GetUser/{email}")
def get_user_by_email(email: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    u = db.query(User).filter(User.Email == email).first()
    if not u:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {
        "id": u.Id,
        "name": u.Name,
        "email": u.Email,
        "type": u.Type,
        "password": u.Password,
        "score": u.Score,
    }


@router.put("/EditUser/{user_id}")
def edit_user(user_id: int, body: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, str]:
    u = db.query(User).filter(User.Id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    email = body.get("email")
    category = body.get("category")
    password = body.get("password")
    if email is not None:
        u.Email = str(email).strip()
    if category is not None:
        u.Type = int(category)
    if password is not None:
        u.Password = str(password)
    db.commit()
    return {"message": "Пользователь обновлен"}


@router.delete("/DeleteUser/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    u = db.query(User).filter(User.Id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    db.query(Favorite).filter(Favorite.UserID == user_id).delete()
    db.query(Comment).filter(Comment.UserId == user_id).delete()
    db.delete(u)
    db.commit()
    return {"message": "Пользователь удален"}
