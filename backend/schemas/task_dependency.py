"""Схемы Pydantic v2 для сущности TaskDependency."""

import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.enums import DependencyType


class TaskDependencyCreate(BaseModel):
    """Схема создания связи между задачами."""

    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    dependency_type: DependencyType = DependencyType.FS
    lag_days: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_not_self_dependency(self) -> "TaskDependencyCreate":
        """Запретить связь задачи самой с собой."""
        if self.predecessor_id == self.successor_id:
            raise ValueError("predecessor_id must differ from successor_id")
        return self


class TaskDependencyUpdate(BaseModel):
    """Схема частичного обновления связи между задачами."""

    dependency_type: DependencyType | None = None
    lag_days: int | None = Field(default=None, ge=0)


class TaskDependencyResponse(BaseModel):
    """Схема ответа с данными связи между задачами."""

    model_config = ConfigDict(from_attributes=True)

    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    dependency_type: DependencyType
    lag_days: int
