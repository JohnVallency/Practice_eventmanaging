"""Экспорт ORM-моделей для автогенерации миграций Alembic.

Новые модели добавляйте в этот список, чтобы env.py видел metadata.
"""

from models.base import Base, uuid_pk

__all__ = ["Base", "uuid_pk"]
