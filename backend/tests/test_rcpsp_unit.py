"""Юнит-тесты чистого ядра ресурсного выравнивания расписания (serial SGS).

Проверяют serial_sgs из services.rcpsp без БД и без API: на вход подаются
dataclass-заглушки — задачи с готовыми CPM-полями (ES/TF/is_critical),
связи, назначения ресурсов и ресурсы. Эталонные числа зафиксированы
контрактом ядра. Пакет services доступен благодаря pythonpath=. из
backend/pytest.ini — тот же паттерн, что и в test_scheduling_unit.py.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal

import pytest

from services.rcpsp import serial_sgs


@dataclass
class T:
    """Заглушка задачи: CPM-поля приходят готовыми из services.scheduling."""

    id: uuid.UUID
    duration_days: int
    earliest_start: int
    total_float: int
    is_critical: bool


@dataclass
class D:
    """Заглушка связи задач: предшественник -> последователь."""

    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    dependency_type: str
    lag_days: int


@dataclass
class A:
    """Заглушка назначения ресурса на задачу."""

    task_id: uuid.UUID
    resource_id: uuid.UUID
    units_allocated: int | float


@dataclass
class R:
    """Заглушка возобновляемого ресурса."""

    id: uuid.UUID
    availability_per_day: int | float


def _task(
    duration: int,
    es: int = 0,
    tf: int = 0,
    critical: bool = False,
    n: int | None = None,
) -> T:
    """Создать задачу-заглушку; n задаёт детерминированный uuid.UUID(int=n)."""
    task_id = uuid.UUID(int=n) if n is not None else uuid.uuid4()
    return T(
        id=task_id,
        duration_days=duration,
        earliest_start=es,
        total_float=tf,
        is_critical=critical,
    )


def _res(availability: int | float, n: int | None = None) -> R:
    """Создать ресурс-заглушку с суточной доступностью availability."""
    resource_id = uuid.UUID(int=n) if n is not None else uuid.uuid4()
    return R(id=resource_id, availability_per_day=availability)


def _asg(task: T, resource: R, units: int | float) -> A:
    """Назначить units единиц ресурса resource на задачу task."""
    return A(task_id=task.id, resource_id=resource.id, units_allocated=units)


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


def _actual(
    result: dict[uuid.UUID, dict[str, int]], task: T
) -> tuple[int, int, int]:
    """Кортёж (actual_start, actual_finish, delay_days) задачи из результата."""
    row = result[task.id]
    return row["actual_start"], row["actual_finish"], row["delay_days"]


def _diamond() -> tuple[list[T], list[D]]:
    """Ромб A(2),B(3),C(5),D(4) FS lag 0: ES 0/2/2/7, TF 0/2/0/0, критичны A,C,D."""
    a = _task(2, es=0, tf=0, critical=True)
    b = _task(3, es=2, tf=2)
    c = _task(5, es=2, tf=0, critical=True)
    d = _task(4, es=7, tf=0, critical=True)
    deps = [_dep(a, b), _dep(a, c), _dep(b, d), _dep(c, d)]
    return [a, b, c, d], deps


class TestSerialSgsWithoutAssignments:
    """Без назначений фактические даты совпадают с CPM (ES/EF), delay 0."""

    def test_diamond_matches_cpm_schedule(self) -> None:
        """Ромб без назначений: actual == ES/EF у всех, delay_days == 0."""
        tasks, deps = _diamond()
        a, b, c, d = tasks

        result = serial_sgs(tasks, deps, [], [])

        assert _actual(result, a) == (0, 2, 0)
        assert _actual(result, b) == (2, 5, 0)
        assert _actual(result, c) == (2, 7, 0)
        assert _actual(result, d) == (7, 11, 0)

    def test_empty_tasks_returns_empty_dict(self) -> None:
        """Пустой набор задач даёт пустой словарь результата."""
        assert serial_sgs([], [], [], []) == {}

    def test_fs_lag_uses_actual_finish_of_predecessor(self) -> None:
        """FS lag=3: P(2)->Q(2), ES_Q=0: floor = af_P+3 = 5 => Q 5/7, delay 5.

        ES_Q нарочно занижен относительно CPM, чтобы изолировать формулу лага.
        """
        p = _task(2, es=0, tf=0, critical=True)
        q = _task(2, es=0, tf=9)

        result = serial_sgs([p, q], [_dep(p, q, "FS", 3)], [], [])

        assert _actual(result, p) == (0, 2, 0)
        assert _actual(result, q) == (5, 7, 5)

    def test_ss_lag_uses_actual_start_of_predecessor(self) -> None:
        """SS lag=1: S(3)->T(2), ES_T=1: as_T = as_S+1 = 1 => T 1/3, delay 0."""
        s = _task(3, es=0, tf=0, critical=True)
        t = _task(2, es=1, tf=0, critical=True)

        result = serial_sgs([s, t], [_dep(s, t, "SS", 1)], [], [])

        assert _actual(result, s) == (0, 3, 0)
        assert _actual(result, t) == (1, 3, 0)

    def test_ff_formula_uses_actual_finish_minus_duration(self) -> None:
        """FF lag=2: P(3)->Q(2), ES_Q=0: floor = af_P+lag-dur = 3+2-2 = 3."""
        p = _task(3, es=0, tf=0, critical=True)
        q = _task(2, es=0, tf=9)

        result = serial_sgs([p, q], [_dep(p, q, "FF", 2)], [], [])

        assert _actual(result, p) == (0, 3, 0)
        assert _actual(result, q) == (3, 5, 3)

    def test_sf_formula_uses_actual_start_minus_duration(self) -> None:
        """SF lag=3: P(3)->Q(2), ES_Q=0: floor = as_P+lag-dur = 0+3-2 = 1."""
        p = _task(3, es=0, tf=0, critical=True)
        q = _task(2, es=0, tf=9)

        result = serial_sgs([p, q], [_dep(p, q, "SF", 3)], [], [])

        assert _actual(result, p) == (0, 3, 0)
        assert _actual(result, q) == (1, 3, 1)


class TestSerialSgsResourceConflicts:
    """Ресурсный конфликт сдвигает старт по дням до первого свободного."""

    def test_critical_task_first_and_non_critical_shifted(self) -> None:
        """K(2, крит) и N(2) по 4 units при avail 5: K@0, N сдвинута на 2."""
        k = _task(2, es=0, tf=0, critical=True)
        n = _task(2, es=0, tf=3)
        res = _res(5)

        result = serial_sgs(
            [n, k], [], [_asg(k, res, 4), _asg(n, res, 4)], [res]
        )

        assert _actual(result, k) == (0, 2, 0)
        assert _actual(result, n) == (2, 4, 2)

    def test_priority_tie_broken_by_id_string_in_both_orders(self) -> None:
        """X(2) и Y(3) по 6 units при avail 10: первым идёт меньший str(id).

        Прямой порядок (str X < str Y): X@0 (дни 0-1), Y@2, delay 2.
        Обратный порядок (str Y < str X): Y@0 занимает дни 0-2, поэтому
        X помещается только с дня 3 (посуточный сдвиг), delay 3.
        """
        res = _res(10)
        x1, y2 = _task(2, tf=5, n=1), _task(3, tf=5, n=2)
        first = serial_sgs(
            [x1, y2], [], [_asg(x1, res, 6), _asg(y2, res, 6)], [res]
        )
        assert _actual(first, x1) == (0, 2, 0)
        assert _actual(first, y2) == (2, 5, 2)

        x2, y1 = _task(2, tf=5, n=2), _task(3, tf=5, n=1)
        second = serial_sgs(
            [x2, y1], [], [_asg(x2, res, 6), _asg(y1, res, 6)], [res]
        )
        assert _actual(second, y1) == (0, 3, 0)
        assert _actual(second, x2) == (3, 5, 3)

    def test_fs_lag_floor_holds_despite_free_resources(self) -> None:
        """FS lag=2: P(2)->Q(2) по 5 units при avail 5: P 0/2, Q 4/6, delay 0.

        Ресурс свободен уже с дня 2, но лаг удерживает Q на ES=4.
        """
        p = _task(2, es=0, tf=0, critical=True)
        q = _task(2, es=4, tf=0, critical=True)
        res = _res(5)

        result = serial_sgs(
            [p, q],
            [_dep(p, q, "FS", 2)],
            [_asg(p, res, 5), _asg(q, res, 5)],
            [res],
        )

        assert _actual(result, p) == (0, 2, 0)
        assert _actual(result, q) == (4, 6, 0)

    def test_two_resources_conflict_on_each_with_decimal_units(self) -> None:
        """Конфликт по каждому из двух ресурсов; units Decimal + avail float.

        F(2, крит) занимает дни 0-1 на R1 (3 из 7.0); F2(2) — дни 2-3 на
        R2 (2 из 4.0). G(2) просит Decimal("4.5") на R1 и 3.0 на R2:
        R1 блокирует старты 0-1, R2 — старты 2-3, поэтому G@4 (delay 4).
        """
        f = _task(2, es=0, tf=0, critical=True)
        f2 = _task(2, es=2, tf=0, critical=True)
        g = _task(2, es=0, tf=9)
        r1 = _res(7.0)
        r2 = _res(4.0)

        result = serial_sgs(
            [g, f2, f],
            [_dep(f, f2)],
            [
                _asg(f, r1, 3),
                _asg(f2, r2, 2),
                _asg(g, r1, Decimal("4.5")),
                _asg(g, r2, 3.0),
            ],
            [r1, r2],
        )

        assert _actual(result, f) == (0, 2, 0)
        assert _actual(result, f2) == (2, 4, 0)
        assert _actual(result, g) == (4, 6, 4)

    def test_multiple_assignments_same_resource_are_summed(self) -> None:
        """Два назначения одной задачи на один ресурс суммируются: 4+3=7.

        M(2, крит) занимает дни 0-1 семью единицами из десяти, поэтому
        W(2) с 5 units рядом не помещается (12 > 10) и сдвигается на 2.
        """
        m = _task(2, es=0, tf=0, critical=True)
        w = _task(2, es=0, tf=9)
        res = _res(10)

        result = serial_sgs(
            [w, m],
            [],
            [_asg(m, res, 4), _asg(m, res, 3), _asg(w, res, 5)],
            [res],
        )

        assert _actual(result, m) == (0, 2, 0)
        assert _actual(result, w) == (2, 4, 2)


class TestSerialSgsErrors:
    """Невозможные входные данные дают ValueError с контрактным сообщением."""

    def test_demand_exceeds_availability_raises(self) -> None:
        """Спрос 12 units при avail 10 невозможен — ранняя ошибка."""
        task = _task(2)
        res = _res(10)

        with pytest.raises(ValueError, match="Resource demand exceeds availability"):
            serial_sgs([task], [], [_asg(task, res, 12)], [res])

    def test_dependency_cycle_raises(self) -> None:
        """Цикл A->B->A не размещается — ValueError про цикл."""
        a, b = _task(2), _task(3)

        with pytest.raises(ValueError, match="Dependency cycle"):
            serial_sgs([a, b], [_dep(a, b), _dep(b, a)], [], [])

    def test_self_loop_raises(self) -> None:
        """Self-loop A->A тоже считается циклом."""
        a = _task(2)

        with pytest.raises(ValueError, match="Dependency cycle"):
            serial_sgs([a], [_dep(a, a)], [], [])


class TestSerialSgsDeterminism:
    """Повторный прогон на том же вводе даёт идентичный результат."""

    def test_two_runs_identical_dicts(self) -> None:
        """Два вызова serial_sgs на одном вводе возвращают равные словари."""
        k = _task(2, es=0, tf=0, critical=True)
        n = _task(2, es=0, tf=3)
        res = _res(5)
        assignments = [_asg(k, res, 4), _asg(n, res, 4)]

        first = serial_sgs([k, n], [], assignments, [res])
        second = serial_sgs([k, n], [], assignments, [res])

        assert first == second
