"""Базовые строительные блоки ORM-моделей EventLMS.

Первичные ключи — UUID, генерируемый встроенной функцией PostgreSQL 16
``gen_random_uuid()``. Расширение pgcrypto не используется.
"""

import uuid

from sqlalchemy import MetaData, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Декларативная база всех моделей EventLMS."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def uuid_pk() -> Mapped[uuid.UUID]:
    """Объявить UUID-первичный ключ с генерацией на стороне PostgreSQL.

    Returns:
        mapped_column c типом UUID и server_default gen_random_uuid().
    """
    return mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
