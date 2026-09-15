"""Роутеры EventLMS: health и доменные CRUD-роутеры.

Каждый доменный роутер подключается в main.py через include_router.
"""

from api.routes.assignments import router as assignments_router
from api.routes.events import router as events_router
from api.routes.expenses import router as expenses_router
from api.routes.health import router as health_router
from api.routes.notifications import router as notifications_router
from api.routes.resource_schedule import router as resource_schedule_router
from api.routes.resources import router as resources_router
from api.routes.schedule import router as schedule_router
from api.routes.tasks import router as tasks_router
from api.routes.venues import router as venues_router

__all__ = [
    "assignments_router",
    "events_router",
    "expenses_router",
    "health_router",
    "notifications_router",
    "resource_schedule_router",
    "resources_router",
    "schedule_router",
    "tasks_router",
    "venues_router",
]
