"""Доменные перечисления EventLMS для ORM-моделей и Pydantic-схем."""

import enum


class EventStatus(str, enum.Enum):
    """Статус события: черновик, активное, завершённое, архивное."""

    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class ResourceType(str, enum.Enum):
    """Тип ресурса: человек, оборудование или площадка."""

    HUMAN = "human"
    EQUIPMENT = "equipment"
    VENUE = "venue"


class DependencyType(str, enum.Enum):
    """Тип связи между задачами (метод критического пути)."""

    FS = "FS"  # Finish-to-Start: старт последователя после финиша предшественника
    SS = "SS"  # Start-to-Start: старт последователя после старта предшественника
    FF = "FF"  # Finish-to-Finish: финиш последователя после финиша предшественника
    SF = "SF"  # Start-to-Finish: финиш последователя после старта предшественника


class NotificationType(str, enum.Enum):
    """Тип уведомления: просроченная задача или общая информация."""

    TASK_OVERDUE = "task_overdue"
    INFO = "info"
