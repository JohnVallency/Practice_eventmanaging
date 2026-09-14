"""Асинхронное подключение к PostgreSQL для EventLMS.

Создаёт async-движок SQLAlchemy 2.0 и фабрику сессий.
Подключение к БД не выполняется на этапе импорта: движок ленив,
реальные соединения открываются только при первом использовании сессии.
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from core.config import settings

engine: AsyncEngine = create_async_engine(
    settings.build_database_url(),
    echo=settings.debug,
    pool_pre_ping=True,
)

async_session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Выдать сессию БД для Depends FastAPI.

    Коммитит успешную транзакцию и всегда закрывает сессию.

    Yields:
        AsyncSession: активная сессия SQLAlchemy.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    """Закрыть пул соединений (для graceful shutdown)."""
    await engine.dispose()
