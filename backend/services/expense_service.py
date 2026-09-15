"""Сервисный слой для сущности Expense (расходы события).

Схема транзакций единая со всеми сервисами: методы работают внутри сессии
из зависимости ``get_session``; коммит выполняет сам ``get_session`` после
успешного ответа роута, сервис делает ``await session.flush()``.
"""

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Event, Expense
from schemas.expense import ExpenseCreate
from services.event_service import EventService


class ExpenseService:
    """Операции над расходами и сводкой бюджета события."""

    @staticmethod
    async def create_expense(
        session: AsyncSession, event_id: uuid.UUID, data: ExpenseCreate
    ) -> Expense:
        """Создать расход в существующем событии.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события-родителя.
            data: валидированные данные создания расхода.

        Returns:
            Expense: сохранённый расход с заполненными серверными полями.

        Raises:
            ResourceNotFound: если событие-родитель не найдено.
        """
        await EventService.get_or_404(session, event_id)
        expense = Expense(**data.model_dump(), event_id=event_id)
        session.add(expense)
        await session.flush()
        await session.refresh(expense)
        return expense

    @staticmethod
    async def list_expenses(
        session: AsyncSession, event_id: uuid.UUID
    ) -> list[Expense]:
        """Получить все расходы события, отсортированные по дате и id.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Returns:
            list[Expense]: расходы события.

        Raises:
            ResourceNotFound: если событие не найдено.
        """
        await EventService.get_or_404(session, event_id)
        result = await session.execute(
            select(Expense)
            .where(Expense.event_id == event_id)
            .order_by(Expense.date, Expense.id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def budget_summary(
        session: AsyncSession, event_id: uuid.UUID
    ) -> dict[str, object]:
        """Рассчитать сводку бюджета события.

        Args:
            session: активная сессия SQLAlchemy.
            event_id: UUID события.

        Returns:
            dict: {"event_id": UUID, "total_budget": Decimal | None,
            "total_expenses": Decimal, "remaining_budget": Decimal | None,
            "expenses_count": int}. Если бюджет не задан (None),
            remaining_budget тоже None (без отрицательной арифметики).

        Raises:
            ResourceNotFound: если событие не найдено.
        """
        event = await EventService.get_or_404(session, event_id)
        expenses_sum: Decimal = await session.scalar(
            select(
                func.coalesce(func.sum(Expense.amount), 0)
            ).where(Expense.event_id == event_id)
        )
        expenses_count: int = await session.scalar(
            select(func.count())
            .select_from(Expense)
            .where(Expense.event_id == event_id)
        )
        total_budget = event.total_budget
        remaining_budget: Decimal | None = (
            total_budget - expenses_sum
            if total_budget is not None
            else None
        )
        return {
            "event_id": event_id,
            "total_budget": total_budget,
            "total_expenses": expenses_sum,
            "remaining_budget": remaining_budget,
            "expenses_count": expenses_count,
        }
