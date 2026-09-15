"""Чистое ядро ресурсного выравнивания расписания (RCPSP, serial SGS).

Модуль зависит ТОЛЬКО от стандартной библиотеки Python 3.11+
(collections, typing, uuid) и не знает ни про SQLAlchemy, ни про Pydantic:
на вход принимаются любые объекты-«утки» с нужными атрибутами (ORM-модели,
dataclass-заглушки в тестах и т.п.) — как в ``services.scheduling``.

CPM-поля (ES/EF/LS/LF/TF) здесь НЕ пересчитываются: вызывающая сторона
передаёт готовые целые ``earliest_start`` и ``total_float`` каждой задачи.
Все временные величины — целые дни от условного старта события (день 0).

Реализована Serial Schedule Generation Scheme: задачи нумеруются по одной,
в порядке приоритета; на каждом шаге задача получает минимально возможный
старт, при котором не нарушены ни зависимости с уже назначенными
предшественниками, ни ресурсные ограничения (возобновляемые ресурсы).

Приоритет (возрастание кортежа)::

    key = (0 если is_critical иначе 1, total_float, earliest_start, str(id))

Критические задачи (TF=0) всегда впереди некритических; при равенстве
ключей порядок детерминирован благодаря строковому представлению id.

Нижняя граница старта из предшественников (``as_p``/``af_p`` — фактические
старт/финиш уже назначенного предшественника, ``dur`` — длительность
назначаемой задачи, ``lag`` — ``lag_days``)::

    FS: af_p + lag          SS: as_p + lag
    FF: af_p + lag - dur    SF: as_p + lag - dur
    floor = max(earliest_start, все ограничения предшественников)

Занятость возобновляемого ресурса в день d::

    occupancy[d][r] = sum(units_allocated задач, занимающих день d ресурсом r)

Задача занимает дни ``range(start, start + duration_days)``; старт —
минимальный ``start >= floor``, при котором для каждого дня d диапазона
и каждого ресурса r из назначений задачи выполнено::

    occupancy[d][r] + units_task_r <= availability_r

Пример ромба и ресурсного конфликта::

    A(2) -> B(3) -> D(4)
      \\-> C(5) ------^        FS lag 0; критичны A, C, D; ES: 0, 2, 2, 7

    Без назначений (бесконечные ресурсы) фактические старты совпадают
    с ES и delay_days = 0 у всех задач.

    С одним ресурсом R (availability_per_day = 10) и независимыми задачами
    X(2) и Y(3) по 6 units: X стартует в 0 и занимает дни 0-1 на 6/10;
    Y рядом не помещается (6 + 6 = 12 > 10), поэтому сдвигается до 2,
    delay_days(Y) = 2 — классический эффект resource leveling.
"""

import uuid
from collections import defaultdict
from collections.abc import Iterable
from typing import Protocol

# Допустимые строковые значения типа связи (значения enum DependencyType).
_VALID_DEPENDENCY_TYPES: tuple[str, ...] = ("FS", "SS", "FF", "SF")


class _TaskLike(Protocol):
    """Структурный тип задачи, достаточный для ресурсного назначения.

    Совместим с ORM-моделью ``Task`` и с dataclass-заглушками вида
    ``@dataclass class T: id: uuid.UUID; duration_days: int``.
    CPM-поля ``earliest_start``/``total_float``/``is_critical`` приходят
    готовыми из расчёта CPM (``services.scheduling``).
    """

    id: uuid.UUID
    duration_days: int
    earliest_start: int
    total_float: int
    is_critical: bool


class _DependencyLike(Protocol):
    """Структурный тип связи, достаточный для расчёта нижней границы старта."""

    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    dependency_type: str
    lag_days: int


class _AssignmentLike(Protocol):
    """Структурный тип назначения ресурса на задачу."""

    task_id: uuid.UUID
    resource_id: uuid.UUID
    units_allocated: int | float


class _ResourceLike(Protocol):
    """Структурный тип возобновляемого ресурса."""

    id: uuid.UUID
    availability_per_day: int | float


def _dependency_type_value(raw: object) -> str:
    """Нормализовать тип связи к строке "FS"/"SS"/"FF"/"SF".

    Принимает как обычную строку, так и str-enum (например,
    ``models.enums.DependencyType``): у перечисления берётся ``.value``.

    Args:
        raw: значение типа связи (str или enum со строковым значением).

    Returns:
        str: одна из строк "FS", "SS", "FF", "SF".

    Raises:
        ValueError: если тип связи не входит в допустимый набор.
    """
    value = getattr(raw, "value", raw)
    if value not in _VALID_DEPENDENCY_TYPES:
        raise ValueError(f"Неизвестный тип зависимости: {raw!r}")
    return value  # type: ignore[return-value]


def _priority_key(task: _TaskLike) -> tuple[int, int, int, str]:
    """Ключ приоритета: критические впереди, затем меньший TF, ES и id."""
    return (
        0 if task.is_critical else 1,
        task.total_float,
        task.earliest_start,
        str(task.id),
    )


def serial_sgs(
    tasks: Iterable[_TaskLike],
    dependencies: Iterable[_DependencyLike],
    assignments: Iterable[_AssignmentLike],
    resources: Iterable[_ResourceLike],
) -> dict[uuid.UUID, dict[str, int]]:
    """Выровнять расписание по ограниченным ресурсам (Serial SGS).

    Задачи назначаются по одной в порядке приоритета
    ``(0/1 по is_critical, total_float, earliest_start, str(id))``.
    Для каждой задачи вычисляется нижняя граница старта ``floor`` из
    ``earliest_start`` и фактических стартов/финишей уже назначенных
    предшественников (формулы FS/SS/FF/SF с учётом ``lag_days``), затем
    ищется минимальный ``actual_start >= floor``, при котором суммарная
    суточная занятость каждого ресурса не превышает его
    ``availability_per_day`` во все дни ``range(start, start + duration)``.
    Задача без назначений стартует на ``floor`` без ресурсных проверок.

    Args:
        tasks: объекты с атрибутами ``id: uuid.UUID``,
            ``duration_days: int``, ``earliest_start: int >= 0``,
            ``total_float: int``, ``is_critical: bool``.
        dependencies: объекты с атрибутами ``predecessor_id``,
            ``successor_id``, ``dependency_type`` ("FS"/"SS"/"FF"/"SF"),
            ``lag_days: int``. Связи, ведущие к задачам вне ``tasks``
            или исходящие от них, отбрасываются.
        assignments: объекты с атрибутами ``task_id``, ``resource_id``,
            ``units_allocated`` (int | float | Decimal — приводится к float).
        resources: объекты с атрибутами ``id`` и ``availability_per_day``.

    Returns:
        dict[uuid.UUID, dict[str, int]]: для каждой задачи
        ``{"actual_start": int, "actual_finish": int, "delay_days": int}``,
        где ``delay_days = actual_start - earliest_start`` и
        ``actual_finish = actual_start + duration_days``.

    Raises:
        ValueError: "Dependency cycle in resource scheduling" — если остались
            неназначенные задачи, но ни одна не имеет всех предшественников
            назначенными (цикл); "Resource demand exceeds availability: ..."
            — если суммарный спрос задачи на ресурс превышает его
            доступность (задача никогда не разместится).

    Example:
        >>> r = uuid.uuid4()                              # doctest: +SKIP
        >>> x, y = uuid.UUID(int=1), uuid.UUID(int=2)     # doctest: +SKIP
        >>> serial_sgs(                                   # doctest: +SKIP
        ...     [Task(x, 2, 0, 5, False), Task(y, 3, 0, 5, False)],
        ...     [], [Assignment(x, r, 6), Assignment(y, r, 6)],
        ...     [Resource(r, 10)],
        ... ) == {x: {"actual_start": 0, "actual_finish": 2, "delay_days": 0},
        ...       y: {"actual_start": 2, "actual_finish": 5, "delay_days": 2}}
        True
    """
    task_list = list(tasks)
    by_id: dict[uuid.UUID, _TaskLike] = {t.id: t for t in task_list}

    # Доступность ресурсов (units/availability приводим к float, Decimal совместим).
    availability: dict[uuid.UUID, float] = {
        r.id: float(r.availability_per_day) for r in resources
    }

    # Спрос задачи на ресурсы: task_id -> {resource_id: float units/день}.
    demand: dict[uuid.UUID, dict[uuid.UUID, float]] = defaultdict(dict)
    for a in assignments:
        if a.task_id not in by_id:
            continue
        per_resource = demand[a.task_id]
        per_resource[a.resource_id] = (
            per_resource.get(a.resource_id, 0.0) + float(a.units_allocated)
        )

    # Правило 5: спрос, который никогда не поместится, — ранняя ошибка.
    for task_id, per_resource in demand.items():
        for resource_id, units in per_resource.items():
            avail = availability.get(resource_id)
            if avail is not None and units > avail:
                raise ValueError(
                    f"Resource demand exceeds availability: task {task_id} "
                    f"needs {units} units/day of resource {resource_id}, "
                    f"available {avail}"
                )

    # Рёбра только между задачами набора; self-loop тоже цикл — оставляем.
    predecessors: dict[uuid.UUID, list[tuple[uuid.UUID, str, int]]] = defaultdict(list)
    for dep in dependencies:
        pred_id, succ_id = dep.predecessor_id, dep.successor_id
        if pred_id in by_id and succ_id in by_id:
            predecessors[succ_id].append(
                (pred_id, _dependency_type_value(dep.dependency_type), dep.lag_days)
            )

    # occupancy[day][resource_id] = суммарная занятость ресурса в этот день.
    occupancy: dict[int, dict[uuid.UUID, float]] = defaultdict(dict)
    scheduled: dict[uuid.UUID, tuple[int, int]] = {}
    result: dict[uuid.UUID, dict[str, int]] = {}
    remaining: set[uuid.UUID] = set(by_id)

    while remaining:
        # Правило 1: eligible — все предшественники уже назначены.
        eligible = [
            task_id
            for task_id in remaining
            if all(pred_id in scheduled for pred_id, _, _ in predecessors[task_id])
        ]
        if not eligible:
            raise ValueError("Dependency cycle in resource scheduling")
        eligible.sort(key=lambda task_id: _priority_key(by_id[task_id]))
        task_id = eligible[0]
        task = by_id[task_id]
        duration = task.duration_days

        # Правило 2: нижняя граница старта из CPM и предшественников.
        floor = task.earliest_start
        for pred_id, dep_type, lag in predecessors[task_id]:
            as_p, af_p = scheduled[pred_id]
            if dep_type == "FS":
                bound = af_p + lag
            elif dep_type == "SS":
                bound = as_p + lag
            elif dep_type == "FF":
                bound = af_p + lag - duration
            else:  # "SF"
                bound = as_p + lag - duration
            floor = max(floor, bound)

        per_resource = demand.get(task_id, {})
        if per_resource:
            # Правило 3: первый день старта без конфликта на всех днях диапазона.
            start = floor
            while any(
                occupancy[day].get(resource_id, 0.0) + units > availability[resource_id]
                for day in range(start, start + duration)
                for resource_id, units in per_resource.items()
                if resource_id in availability
            ):
                start += 1
            # Фиксируем занятость по всем дням диапазона.
            for day in range(start, start + duration):
                day_load = occupancy[day]
                for resource_id, units in per_resource.items():
                    day_load[resource_id] = day_load.get(resource_id, 0.0) + units
        else:
            # Правило 4: назначений нет — ресурсных проверок нет.
            start = floor

        actual_finish = start + duration
        scheduled[task_id] = (start, actual_finish)
        result[task_id] = {
            "actual_start": start,
            "actual_finish": actual_finish,
            "delay_days": start - task.earliest_start,
        }
        remaining.discard(task_id)

    return result
