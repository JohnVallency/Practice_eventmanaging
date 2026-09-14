"""Доменные исключения EventLMS.

Сервисный слой бросает эти исключения вместо HTTPException:
глобальные обработчики в main.py превращают их в JSON-ответы
с соответствующим HTTP-статусом.
"""

from __future__ import annotations


class AppError(Exception):
    """Базовое доменное исключение с HTTP-статусом ответа.

    Attributes:
        message: человекочитаемое описание ошибки (тело ``detail``).
        status_code: HTTP-статус, которым ответит обработчик.
    """

    def __init__(self, message: str, status_code: int = 400) -> None:
        """Инициализировать доменное исключение.

        Args:
            message: человекочитаемое описание ошибки.
            status_code: HTTP-статус ответа, по умолчанию 400.
        """
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ResourceNotFound(AppError):
    """Запрошенная сущность не найдена (HTTP 404)."""

    def __init__(self, message: str = "Ресурс не найден", status_code: int = 404) -> None:
        """Инициализировать исключение отсутствия сущности.

        Args:
            message: описание того, какая сущность не найдена.
            status_code: фиксируется 404.
        """
        super().__init__(message, status_code)


class ValidationError(AppError):
    """Доменное нарушение правил валидации (HTTP 400).

    Не путать с pydantic ValidationError: эта ошибка возникает
    на уровне бизнес-правил, а не схемы запроса.
    """

    def __init__(self, message: str = "Ошибка валидации данных", status_code: int = 400) -> None:
        """Инициализировать доменное исключение валидации.

        Args:
            message: описание нарушенного бизнес-правила.
            status_code: фиксируется 400.
        """
        super().__init__(message, status_code)


class ConflictError(AppError):
    """Конфликт состояния: дубликат, переаллокация и т.п. (HTTP 409)."""

    def __init__(self, message: str = "Конфликт данных", status_code: int = 409) -> None:
        """Инициализировать исключение конфликта.

        Args:
            message: описание конфликта.
            status_code: фиксируется 409.
        """
        super().__init__(message, status_code)


class IntegrityViolationError(ConflictError):
    """Нарушение целостности БД: уникальность, FK, CHECK (HTTP 409)."""

    def __init__(self, message: str = "Нарушение целостности данных", status_code: int = 409) -> None:
        """Инициализировать исключение нарушения целостности.

        Args:
            message: описание нарушенного ограничения.
            status_code: фиксируется 409.
        """
        super().__init__(message, status_code)
