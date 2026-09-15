"""Юнит-тесты чистого алгоритмического ядра расписания (CPM).

Проверяют topological_sort_kahn и calculate_forward_pass из
services.scheduling без БД и без API: на вход подаются dataclass-заглушки.
Пакет services доступен благодаря pythonpath=. из backend/pytest.ini —
тот же паттерн импорта, что и в test_schemas.py (без манипуляций sys.path).
"""

import uuid
from dataclasses import dataclass

import pytest

from services.scheduling import (
    CyclicDependencyError,
    calculate_forward_pass,
    topological_sort_kahn,
)


@dataclass
class T:
    """Заглушка задачи: ядру достаточно id и длительности."""

    id: uuid.UUID
    duration_days: int


@dataclass
class D:
    """Заглушка связи задач: предшественник -> последователь."""

    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    dependency_type: str
    lag_days: int


def _task(duration: int) -> T:
    """Создать задачу-заглушку со свежим уникальным UUID."""
    return T(id=uuid.uuid4(), duration_days=duration)


def _dep(
    predecessor: T, successor: T, dependency_type: str = "FS", lag: int = 0
) -> D:
    """Создать связь-заглушку между двумя задачами."""
    return D(
        predecessor_id=predecessor.id,
        successor_id=successor.id,
        dependency_type=dependency_type,
        lag_days=lag,
    )


def _chain(durations: list[int], lag: int = 0) -> tuple[list[T], list[D]]:
    """Линейная цепочка FS-связей: задачи и рёбра между соседями."""
    tasks = [_task(duration) for duration in durations]
    deps = [_dep(tasks[i], tasks[i + 1], "FS", lag) for i in range(len(tasks) - 1)]
    return tasks, deps


class TestTopologicalSortKahn:
    """Детерминированная топологическая сортировка Кана."""

    def test_empty_input_returns_empty_list(self) -> None:
        """Пустой ввод даёт пустой список порядка."""
        assert topological_sort_kahn([], []) == []

    def test_single_task_returns_its_id(self) -> None:
        """Один узел без рёбер — список из одного id."""
        task = _task(3)

        assert topological_sort_kahn([task], []) == [task.id]

    def test_linear_chain_exact_order(self) -> None:
        """Цепочка A->B->C сортируется ровно как A, B, C."""
        tasks, deps = _chain([3, 2, 4])
        a, b, c = tasks

        assert topological_sort_kahn(tasks, deps) == [a.id, b.id, c.id]

    def test_diamond_a_first_d_last(self) -> None:
        """Ромб: A первый, D последний, B и C посередине по возрастанию id."""
        a, b = _task(2), _task(3)
        c, d = _task(5), _task(4)
        deps = [_dep(a, b), _dep(a, c), _dep(b, d), _dep(c, d)]

        result = topological_sort_kahn([a, b, c, d], deps)

        assert result[0] == a.id
        assert result[-1] == d.id
        assert set(result[1:3]) == {b.id, c.id}
        # Детерминизм: стартовая очередь отсортирована по id, поэтому при
        # одних и тех же входных данных порядок B/C одинаков в обоих прогонах
        # (полная лексикографическая сортировка дала бы O((V+E)·log V),
        # что нарушает контракт ядра O(V+E)).
        second_run = topological_sort_kahn([a, b, c, d], deps)
        assert second_run == result

    def test_two_node_cycle_raises(self) -> None:
        """Цикл A->B->A обнаруживается и вызывает CyclicDependencyError."""
        a, b = _task(2), _task(3)
        deps = [_dep(a, b), _dep(b, a)]

        with pytest.raises(CyclicDependencyError):
            topological_sort_kahn([a, b], deps)

    def test_three_node_cycle_raises(self) -> None:
        """Цикл из трёх задач тоже обнаруживается."""
        a, b, c = _task(2), _task(3), _task(4)
        deps = [_dep(a, b), _dep(b, c), _dep(c, a)]

        with pytest.raises(CyclicDependencyError):
            topological_sort_kahn([a, b, c], deps)

    def test_cycle_error_has_message_attribute(self) -> None:
        """У исключения цикла есть атрибут message == "Cycle detected"."""
        a, b = _task(2), _task(3)
        deps = [_dep(a, b), _dep(b, a)]

        with pytest.raises(CyclicDependencyError) as exc_info:
            topological_sort_kahn([a, b], deps)

        assert exc_info.value.message == "Cycle detected"

    def test_multiple_roots_sorted_by_id(self) -> None:
        """Несколько корней без зависимостей упорядочены по возрастанию id."""
        a, b = _task(2), _task(3)

        result = topological_sort_kahn([a, b], [])

        assert result == sorted([a.id, b.id])

    def test_duplicate_dependency_pair_ignored(self) -> None:
        """Дубликат пары (predecessor, successor) не ломает сортировку."""
        tasks, _ = _chain([2, 3])
        a, b = tasks
        # Две разные заглушки с одинаковой парой id: учитывается первая.
        duplicate = D(a.id, b.id, "FS", 0)

        result = topological_sort_kahn(tasks, [_dep(a, b), duplicate])

        assert result == [a.id, b.id]

    def test_deterministic_across_calls(self) -> None:
        """Два вызова на одном вводе дают идентичный список."""
        tasks, deps = _chain([2, 3, 4])

        first = topological_sort_kahn(tasks, deps)
        second = topological_sort_kahn(tasks, deps)

        assert first == second


class TestCalculateForwardPass:
    """Прямой проход CPM: ранние старты и финишы каждой задачи."""

    def test_no_dependencies_starts_at_zero(self) -> None:
        """Задача без предшественников: ES=0, EF=длительность (d=3)."""
        task = _task(3)

        result = calculate_forward_pass([task], [])

        assert result == {task.id: {"earliest_start": 0, "earliest_finish": 3}}

    def test_fs_chain_lag_zero(self) -> None:
        """FS lag=0: A(3)->B(2) => ES_B=EF_A=3, EF_B=5."""
        a, b = _task(3), _task(2)

        result = calculate_forward_pass([a, b], [_dep(a, b)])

        assert result[b.id]["earliest_start"] == 3
        assert result[b.id]["earliest_finish"] == 5

    def test_fs_chain_with_lag(self) -> None:
        """FS lag=2: A(3)->B(2) => ES_B=EF_A+2=5."""
        a, b = _task(3), _task(2)

        result = calculate_forward_pass([a, b], [_dep(a, b, "FS", 2)])

        assert result[b.id]["earliest_start"] == 5
        assert result[b.id]["earliest_finish"] == 7

    def test_ss_constraint(self) -> None:
        """SS lag=1: A(5)->B(2) => ES_B=ES_A+1=1, EF_B=3."""
        a, b = _task(5), _task(2)

        result = calculate_forward_pass([a, b], [_dep(a, b, "SS", 1)])

        assert result[b.id]["earliest_start"] == 1
        assert result[b.id]["earliest_finish"] == 3

    def test_ff_constraint(self) -> None:
        """FF lag=2: A(5)->B(3) => ES_B=EF_A+lag-d_B=4, EF_B=7."""
        a, b = _task(5), _task(3)

        result = calculate_forward_pass([a, b], [_dep(a, b, "FF", 2)])

        assert result[a.id]["earliest_finish"] == 5
        assert result[b.id]["earliest_start"] == 4
        assert result[b.id]["earliest_finish"] == 7
        # Инвариант FF: финиш последователя не раньше финиша предшественника + лаг.
        assert result[b.id]["earliest_finish"] >= result[a.id]["earliest_finish"] + 2

    def test_sf_constraint(self) -> None:
        """SF lag=2: A(5)->B(3) => ES_B=ES_A+lag-d_B=-1, EF_B=2."""
        a, b = _task(5), _task(3)

        result = calculate_forward_pass([a, b], [_dep(a, b, "SF", 2)])

        assert result[b.id]["earliest_start"] == -1
        assert result[b.id]["earliest_finish"] == 2
        # Инвариант SF: финиш последователя не раньше старта предшественника + лаг.
        assert result[b.id]["earliest_finish"] >= result[a.id]["earliest_start"] + 2

    def test_diamond_es_d_is_max_of_predecessor_finishes(self) -> None:
        """Ромб: ES_D = max(EF_B, EF_C)."""
        a, b, c, d = _task(2), _task(3), _task(5), _task(4)
        deps = [_dep(a, b), _dep(a, c), _dep(b, d), _dep(c, d)]

        result = calculate_forward_pass([a, b, c, d], deps)

        assert result[b.id]["earliest_finish"] == 5
        assert result[c.id]["earliest_finish"] == 7
        assert result[d.id]["earliest_start"] == max(
            result[b.id]["earliest_finish"], result[c.id]["earliest_finish"]
        )
        assert result[d.id]["earliest_finish"] == 11

    def test_empty_tasks_returns_empty_dict(self) -> None:
        """Пустой набор задач даёт пустой словарь результата."""
        assert calculate_forward_pass([], []) == {}

    def test_cycle_raises_from_forward_pass(self) -> None:
        """Цикл обнаруживается и прямым проходом (через топологическую сортировку)."""
        a, b = _task(2), _task(3)
        deps = [_dep(a, b), _dep(b, a)]

        with pytest.raises(CyclicDependencyError):
            calculate_forward_pass([a, b], deps)
