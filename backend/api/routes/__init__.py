"""Роутеры EventLMS: health и доменные CRUD-роутеры.

Каждый доменный роутер подключается в main.py через include_router.
"""

from api.routes.assignments import router as assignments_router
from api.routes.events import router as events_router
from api.routes.health import router as health_router
from api.routes.resources import router as resources_router
from api.routes.schedule import router as schedule_router
from api.routes.tasks import router as tasks_router

__all__ = [
    "assignments_router",
    "events_router",
    "health_router",
    "resources_router",
    "schedule_router",
    "tasks_router",
]
