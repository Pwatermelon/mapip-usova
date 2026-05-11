"""
Технический пользователь в таблице User: заявки с формы «Добавить информацию» без входа
всё равно попадают в PendingSocialMapObject (UserId обязателен по FK).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models import User

GUEST_PENDING_EMAIL = "pending-guest@mapip.internal"


def seed_guest_submitter_if_needed(db: Session) -> None:
    """Вызывать при старте приложения после create_all."""
    from app.models import User

    if db.query(User).filter(User.Email == GUEST_PENDING_EMAIL).first() is not None:
        return
    db.add(
        User(
            Name="Заявки без входа в аккаунт",
            Type=0,
            Email=GUEST_PENDING_EMAIL,
            Password="!",
            Score=0,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def get_submitter_for_pending(db: Session, logged_in: User | None) -> User:
    """Автор заявки или гостевой сабмиттер (создаётся при первом обращении, если seed не успел)."""
    from app.models import User

    if logged_in is not None:
        return logged_in
    u = db.query(User).filter(User.Email == GUEST_PENDING_EMAIL).first()
    if u is not None:
        return u
    u = User(
        Name="Заявки без входа в аккаунт",
        Type=0,
        Email=GUEST_PENDING_EMAIL,
        Password="!",
        Score=0,
    )
    db.add(u)
    db.flush()
    return u
