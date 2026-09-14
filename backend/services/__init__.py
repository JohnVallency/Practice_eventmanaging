"""Экспорт сервисного слоя EventLMS.

Каждый сервис — статические async-методы, принимающие AsyncSession.
"""

from services.assignment_service import AssignmentService
from services.event_service import EventService
from services.resource_service import ResourceService
from services.task_service import TaskService

__all__ = [
    "AssignmentService",
    "EventService",
    "ResourceService",
    "TaskService",
]
