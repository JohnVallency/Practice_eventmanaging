"""Схемы Pydantic v2 для сущности Expense (расходы события)."""

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ExpenseCreate(BaseModel):
    """Схема создания расхода события."""

    category: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(gt=0)
    date: date
    description: str | None = None


class ExpenseResponse(BaseModel):
    """Схема ответа с данными расхода."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    category: str
    amount: Decimal
    date: date
    description: str | None


class BudgetSummaryResponse(BaseModel):
    """Сводка бюджета события: план, расходы и остаток.

    Attributes:
        event_id: UUID события.
        total_budget: плановый бюджет (None, если не задан).
        total_expenses: сумма фактических расходов.
        remaining_budget: остаток бюджета (None, если бюджет не задан).
        expenses_count: количество учтённых расходов.
    """

    event_id: uuid.UUID
    total_budget: Decimal | None
    total_expenses: Decimal
    remaining_budget: Decimal | None
    expenses_count: int
