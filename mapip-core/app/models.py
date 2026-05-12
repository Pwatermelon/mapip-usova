from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table
from sqlalchemy.orm import relationship

from app.db import Base

route_map_object = Table(
    "RouteMapObject",
    Base.metadata,
    Column("RouteId", Integer, ForeignKey("Route.Id"), primary_key=True, quote=True),
    Column("ListObjectsId", Integer, ForeignKey("MapObject.Id"), primary_key=True, quote=True),
    quote=True,
)


class MapObject(Base):
    __tablename__ = "MapObject"

    Id = Column("Id", Integer, primary_key=True, autoincrement=True, quote=True)
    X = Column("X", Float, nullable=False, quote=True)
    Y = Column("Y", Float, nullable=False, quote=True)
    Display_name = Column("Display_name", String, nullable=False, quote=True)
    IRI = Column("IRI", String, nullable=False, quote=True)
    Adress = Column("Adress", String, nullable=False, quote=True)
    Description = Column("Description", String, quote=True)
    Images = Column("Images", String, nullable=False, quote=True)
    Type = Column("Type", String, nullable=False, quote=True)
    Rating = Column("Rating", Integer, quote=True)
    WorkingHours = Column("WorkingHours", String, quote=True)
    CreatedAt = Column("CreatedAt", DateTime, quote=True)
    UpdatedAt = Column("UpdatedAt", DateTime, quote=True)


class User(Base):
    __tablename__ = "User"

    Id = Column("Id", Integer, primary_key=True, autoincrement=True, quote=True)
    Name = Column("Name", String, nullable=False, quote=True)
    Type = Column("Type", Integer, nullable=False, quote=True)
    Email = Column("Email", String, nullable=False, quote=True)
    Password = Column("Password", String, nullable=False, quote=True)
    Score = Column("Score", Integer, nullable=False, default=0, quote=True)
    # Права администратора/эксперта; не выставляется через публичную регистрацию (только сид или БД).
    IsAdmin = Column("IsAdmin", Boolean, nullable=False, default=False, quote=True)


class Comment(Base):
    __tablename__ = "Comment"

    Id = Column("Id", Integer, primary_key=True, autoincrement=True, quote=True)
    Text = Column("Text", String, quote=True)
    Rate = Column("Rate", Integer, nullable=False, quote=True)
    UserId = Column("UserId", Integer, ForeignKey("User.Id"), nullable=False, quote=True)
    Date = Column("Date", DateTime, nullable=False, quote=True)
    # Без FK на MapObject: id объекта может быть из онтологии (отрицательный синтетический id).
    MapObjectId = Column("MapObjectId", Integer, nullable=False, quote=True)

    user = relationship("User", foreign_keys=[UserId])


class Route(Base):
    __tablename__ = "Route"

    Id = Column("Id", Integer, primary_key=True, autoincrement=True, quote=True)
    Date = Column("Date", String, nullable=False, quote=True)
    UserId = Column("UserId", Integer, nullable=False, quote=True)
    # Объект только из онтологии (нет строки в MapObject для M2M): сохраняем id здесь.
    LinkedMapObjectId = Column("LinkedMapObjectId", Integer, nullable=True, quote=True)

    list_objects = relationship(
        "MapObject",
        secondary=route_map_object,
        lazy="selectin",
    )


class Favorite(Base):
    __tablename__ = "Favorite"

    UserID = Column("UserID", Integer, ForeignKey("User.Id"), primary_key=True, quote=True)
    MapObjectID = Column("MapObjectID", Integer, primary_key=True, quote=True)


class AdminSetting(Base):
    """Таблица public.\"AdminSettings\" как в legacy MapApi."""

    __tablename__ = "AdminSettings"

    Id = Column("Id", Integer, primary_key=True, autoincrement=True, quote=True)
    RnValue = Column("RnValue", Integer, nullable=False, default=4, quote=True)
    ExcludedCategories = Column("ExcludedCategories", String, nullable=True, quote=True)
    CronExpression = Column("CronExpression", String, nullable=False, default="0 0 * * *", quote=True)


class PendingSocialMapObject(Base):
    __tablename__ = "PendingSocialMapObject"

    Id = Column("Id", Integer, primary_key=True, autoincrement=True, quote=True)
    DisplayName = Column("DisplayName", String, nullable=False, quote=True)
    Address = Column("Address", String, nullable=False, quote=True)
    X = Column("X", Float, nullable=True, quote=True)
    Y = Column("Y", Float, nullable=True, quote=True)
    Type = Column("Type", String, nullable=False, quote=True)
    Description = Column("Description", String, nullable=True, quote=True)
    DisabilityCategory = Column("DisabilityCategory", String, nullable=True, quote=True)
    WorkingHours = Column("WorkingHours", String, nullable=True, quote=True)
    Images = Column("Images", String, nullable=True, quote=True)
    Accessibility = Column("Accessibility", String, nullable=True, quote=True)
    Excluded = Column("Excluded", Boolean, nullable=False, default=False, quote=True)
    MapObjectLinkId = Column("MapObject", Integer, nullable=True, quote=True)
    DateAdded = Column("DateAdded", DateTime, nullable=False, quote=True)
    Status = Column("Status", String, nullable=False, quote=True)
    UserId = Column("UserId", Integer, ForeignKey("User.Id"), nullable=False, quote=True)

    user = relationship("User", foreign_keys=[UserId])
