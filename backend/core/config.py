"""Конфигурация EventLMS на Pydantic Settings.

Единственная точка чтения переменных окружения и файла .env.
Остальные модули импортируют готовый объект ``settings``.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения, читаемые из окружения и .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    project_name: str = Field(default="EventLMS API")
    debug: bool = Field(default=False)

    # --- PostgreSQL ---
    postgres_host: str = Field(default="localhost")
    postgres_port: int = Field(default=5432)
    postgres_user: str = Field(default="eventlms")
    postgres_password: str = Field(default="eventlms")
    postgres_db: str = Field(default="eventlms")

    # Полная строка подключения; если не задана, собирается из POSTGRES_*.
    database_url: str | None = Field(default=None)

    # --- CORS ---
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    def build_database_url(self) -> str:
        """Собрать DSN для async SQLAlchemy.

        Returns:
            DSN вида postgresql+asyncpg://user:password@host:port/db.
            Если DATABASE_URL задана явно, используется как есть.
        """
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    """Получить кешированный синглтон настроек.

    Returns:
        Единственный экземпляр Settings на процесс.
    """
    return Settings()


settings: Settings = get_settings()
