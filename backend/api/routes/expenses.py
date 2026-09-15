"""Роутер финансов события: расходы и сводка бюджета (prefix /api/events).

Роуты тонкие: валидацию выполняет Pydantic, бизнес-логику — ExpenseService,
доменные ошибки (404 событие) перехватываются глобальными обработчиками в main.py.
"""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from schemas.expense import BudgetSummaryResponse, ExpenseCreate, ExpenseResponse
from services.expense_service import ExpenseService

router = APIRouter(prefix="/api/events", tags=["finances"])


@router.post(
    "/{event_id}/expenses",
    response_model=ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать расход",
)
async def create_expense(
    event_id: uuid.UUID,
    data: ExpenseCreate,
    session: AsyncSession = Depends(get_session),
) -> ExpenseResponse:
    """Добавить расход в существующее событие.

    Args:
        event_id: UUID события.
        data: валидированные данные создания расхода.
        session: сессия БД из зависимости FastAPI.

    Returns:
        ExpenseResponse: созданный расход со статусом 201, иначе 404.
    """
    expense = await ExpenseService.create_expense(session, event_id, data)
    return ExpenseResponse.model_validate(expense)


@router.get(
    "/{event_id}/expenses",
    response_model=list[ExpenseResponse],
    summary="Список расходов события",
)
async def list_expenses(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[ExpenseResponse]:
    """Получить все расходы события.

    Args:
        event_id: UUID события.
        session: сессия БД из зависимости FastAPI.

    Returns:
        list[ExpenseResponse]: список расходов события, иначе 404.
    """
    expenses = await ExpenseService.list_expenses(session, event_id)
    return [ExpenseResponse.model_validate(expense) for expense in expenses]


@router.get(
    "/{event_id}/budget/summary",
    response_model=BudgetSummaryResponse,
    summary="Сводка бюджета события",
)
async def get_budget_summary(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> BudgetSummaryResponse:
    """Получить агрегированную сводку бюджета события.

    Args:
        event_id: UUID события.
        session: сессия БД из зависимости FastAPI.

    Returns:
        BudgetSummaryResponse: план/факт по событию, иначе 404.
    """
    summary = await ExpenseService.budget_summary(session, event_id)
    return BudgetSummaryResponse.model_validate(summary)
