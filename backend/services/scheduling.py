"""Чистое алгоритмическое ядро расчёта расписания (прямой проход CPM).

Модуль зависит ТОЛЬКО от стандартной библиотеки Python 3.11+
(collections, typing, uuid) и не знает ни про SQLAlchemy, ни про Pydantic:
на вход принимаются любые объекты-«утки» с нужными атрибутами (ORM-модели,
dataclass-заглушки в тестах и т.п.).

Все временные величины — целые дни от условного старта события (день 0).

Пример цепочки FS без лага::

    A(2) -> B(3) -> C(4)
    ES: A=0, B=2, C=5;  EF: A=2, B=5, C=9
"""

import uuid
from collections import deque
from collections.abc import Iterable
from typing import Protocol

# Допустимые строковые значения типа связи (значения enum DependencyType).
_VALID_DEPENDENCY_TYPES: tuple[str, ...] = ("FS", "SS", "FF", "SF")


class _TaskLike(Protocol):
    """Структурный тип задачи, достаточный для расчёта.

    Совместим с ORM-моделью ``Task`` и с dataclass-заглушками вида
    ``@dataclass class T: id: uuid.UUID; duration_days: int``.
    """

    id: uuid.UUID
    duration_days: int


class _DependencyLike(Protocol):
    """Структурный тип связи, достаточный для расчёта.

    ``dependency_type`` — строковое значение ``"FS"/"SS"/"FF"/"SF"``
    (str-enum с таким значением тоже подходит: он является подклассом str).
    """

    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    dependency_type: str
    lag_days: int


class CyclicDependencyError(Exception):
    """Граф зависимостей содержит цикл — топологическая сортировка невозможна.

    Attributes:
        message: фиксированное описание ошибки (по умолчанию "Cycle detected").
    """

    def __init__(self, message: str = "Cycle detected") -> None:
        """Инициализировать ошибку цикла.

        Args:
            message: описание ошибки, по умолчанию "Cycle detected".
        """
        super().__init__(message)
        self.message = message


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


def topological_sort_kahn(
    tasks: Iterable[_TaskLike],
    dependencies: Iterable[_DependencyLike],
) -> list[uuid.UUID]:
    """Топологическая сортировка задач алгоритмом Кана за O(V+E).

    Строится граф смежности (dict id -> [successor_id, ...]) и словарь
    полустепеней захода (in_degree); стартовая очередь заполняется задачами
    без предшественников, отсортированными по id — порядок детерминирован.
    Повторяющиеся пары (predecessor_id, successor_id) игнорируются (учитывается
    первое вхождение), а рёбра, ведущие к задачам вне набора ``tasks`` или
    исходящие от них, отбрасываются. Если после обхода обработано меньше
    задач, чем всего, в графе есть цикл.

    Args:
        tasks: объекты с атрибутами ``id: uuid.UUID`` и ``duration_days: int``.
        dependencies: объекты с атрибутами ``predecessor_id``,
            ``successor_id``, ``dependency_type``, ``lag_days``.

    Returns:
        list[uuid.UUID]: id задач в топологическом порядке (предшественник
        всегда раньше последователя). Пустой ввод -> [].

    Raises:
        CyclicDependencyError: если граф зависимостей содержит цикл.

    Example:
        >>> a, b = uuid.uuid4(), uuid.uuid4()
        >>> tasks = [Stub(a, 2), Stub(b, 3)]                # doctest: +SKIP
        >>> deps = [StubDep(a, b, "FS", 0)]                 # doctest: +SKIP
        >>> topological_sort_kahn(tasks, deps) == [a, b]    # doctest: +SKIP
        True
    """
    task_list = list(tasks)
    task_ids = [task.id for task in task_list]
    id_set = set(task_ids)

    # Граф смежности и полустепени захода только по известным задачам.
    adjacency: dict[uuid.UUID, list[uuid.UUID]] = {tid: [] for tid in task_ids}
    in_degree: dict[uuid.UUID, int] = {tid: 0 for tid in task_ids}

    seen_pairs: set[tuple[uuid.UUID, uuid.UUID]] = set()
    for dep in dependencies:
        pred, succ = dep.predecessor_id, dep.successor_id
        if pred not in id_set or succ not in id_set:
            # Ребро касается задачи вне набора — для сортировки игнорируем.
            continue
        pair = (pred, succ)
        if pair in seen_pairs:
            # Повторяющаяся пара — игнорируем (не дублируем ребро и in_degree).
            continue
        seen_pairs.add(pair)
        adjacency[pred].append(succ)
        in_degree[succ] += 1

    # Стартовая очередь: задачи без предшественников, отсортированные по id.
    queue: deque[uuid.UUID] = deque(
        sorted(tid for tid in task_ids if in_degree[tid] == 0)
    )
    order: list[uuid.UUID] = []
    while queue:
        tid = queue.popleft()
        order.append(tid)
        for succ in adjacency[tid]:
            in_degree[succ] -= 1
            if in_degree[succ] == 0:
                queue.append(succ)

    if len(order) < len(task_ids):
        # Часть задач осталась с положительной полустепенью захода — цикл.
        raise CyclicDependencyError()
    return order


def calculate_forward_pass(
    tasks: Iterable[_TaskLike],
    dependencies: Iterable[_DependencyLike],
) -> dict[uuid.UUID, dict[str, int]]:
    """Прямой проход CPM: ранние старты и финишы каждой задачи.

    Сначала вызывается :func:`topological_sort_kahn` (цикл обнаружится сам),
    затем задачи обрабатываются в топологическом порядке. Для задачи без
    предшественников ES = 0; иначе ES — максимум по ограничениям всех связей,
    где ``lag`` — лаг в днях, ``d`` — длительность самой задачи::

        FS: ES = max(EF_pred + lag)
        SS: ES = max(ES_pred + lag)
        FF: ES = max(EF_pred + lag - d)
        SF: ES = max(ES_pred + lag - d)

    Финиш всегда равен EF = ES + duration_days. Повторяющиеся пары
    (predecessor_id, successor_id) игнорируются (учитывается первое вхождение);
    связи с типом вне {"FS","SS","FF","SF"} вызывают ValueError.

    Args:
        tasks: объекты с атрибутами ``id: uuid.UUID`` и ``duration_days: int``.
        dependencies: объекты с атрибутами ``predecessor_id``,
            ``successor_id``, ``dependency_type``, ``lag_days``.

    Returns:
        dict: {task_id: {"earliest_start": int, "earliest_finish": int}}.
        Пустой tasks -> {}.

    Raises:
        CyclicDependencyError: если граф зависимостей содержит цикл.
        ValueError: если у связи неизвестный тип зависимости.

    Example:
        Цепочка A(2) -FS-> B(3) -FS-> C(4) без лага::

            ES(B) = EF(A) + 0 = 2
            ES(C) = EF(B) + 0 = 5;  EF(C) = 5 + 4 = 9

        Связь SS с лагом 1: если ES(A) = 0, то ES(B) = 0 + 1 = 1.
    """
    # Топологический порядок (при цикле здесь вылетит CyclicDependencyError).
    order = topological_sort_kahn(tasks, dependencies)
    if not order:
        return {}

    durations: dict[uuid.UUID, int] = {
        task.id: int(task.duration_days) for task in tasks
    }

    # Ограничения по последователям: successor_id -> [(pred_id, тип, лаг)].
    constraints: dict[uuid.UUID, list[tuple[uuid.UUID, str, int]]] = {}
    seen_pairs: set[tuple[uuid.UUID, uuid.UUID]] = set()
    for dep in dependencies:
        pair = (dep.predecessor_id, dep.successor_id)
        if pair in seen_pairs:
            # Повторяющаяся пара — игнорируем (учитываем первое вхождение).
            continue
        seen_pairs.add(pair)
        constraints.setdefault(dep.successor_id, []).append(
            (
                dep.predecessor_id,
                _dependency_type_value(dep.dependency_type),
                int(dep.lag_days),
            )
        )

    earliest: dict[uuid.UUID, dict[str, int]] = {}
    es_values: dict[uuid.UUID, int] = {}
    ef_values: dict[uuid.UUID, int] = {}

    for tid in order:
        duration = durations[tid]
        deps = constraints.get(tid)
        if not deps:
            es = 0
        else:
            candidates: list[int] = []
            for pred_id, dep_type, lag in deps:
                # Предшественники гарантированно уже обработаны:
                # они идут раньше в топологическом порядке.
                if dep_type == "FS":
                    candidates.append(ef_values[pred_id] + lag)
                elif dep_type == "SS":
                    candidates.append(es_values[pred_id] + lag)
                elif dep_type == "FF":
                    candidates.append(ef_values[pred_id] + lag - duration)
                else:  # "SF"
                    candidates.append(es_values[pred_id] + lag - duration)
            es = max(candidates)
        ef = es + duration
        es_values[tid] = es
        ef_values[tid] = ef
        earliest[tid] = {"earliest_start": es, "earliest_finish": ef}

    return earliest
