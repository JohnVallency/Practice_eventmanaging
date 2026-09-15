"""Экспорт ORM-моделей для автогенерации миграций Alembic.

Новые модели добавляйте в этот список, чтобы env.py видел metadata.
"""

from models.assignment import Assignment
from models.base import Base, uuid_pk
from models.enums import DependencyType, EventStatus, NotificationType, ResourceType
from models.event import Event
from models.expense import Expense
from models.notification import Notification
from models.resource import Resource
from models.task import Task
from models.task_dependency import TaskDependency
from models.venue import Venue

__all__ = [
    "Assignment",
    "Base",
    "DependencyType",
    "Event",
    "EventStatus",
    "Expense",
    "Notification",
    "NotificationType",
    "Resource",
    "ResourceType",
    "Task",
    "TaskDependency",
    "uuid_pk",
    "Venue",
]
