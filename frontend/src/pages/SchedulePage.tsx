/**
 * Страница CPM-расписания /events/:id/schedule.
 * Расчёт по кнопке, критический путь чипами, таблица ранних/поздних дат.
 */

import { useCallback, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../services/api";
import type { ScheduleCalculationResponse, Task } from "../types";
import { Badge, Button, EmptyState, Skeleton, Spinner, useToast } from "../components/ui";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

/** Смещение в днях → "день N" или "—". */
function formatDay(value: number | null): string {
  return value === null ? "—" : `день ${value}`;
}

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const { push } = useToast();
  const pushRef = useRef(push);
  // push может быть нестабилен между рендерами — держим его в ref для колбэков.

  const [schedule, setSchedule] = useState<ScheduleCalculationResponse | null>(null);
  const [taskNames, setTaskNames] = useState<Record<string, string>>({});
  const [calculating, setCalculating] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTaskNames = useCallback(async (): Promise<Record<string, string>> => {
    if (!id) {
      return {};
    }
    setLoadingTasks(true);
    try {
      const tasks: Task[] = await api.tasks.list(id);
      const names: Record<string, string> = {};
      for (const task of tasks) {
        names[String(task.id)] = task.name;
      }
      setTaskNames(names);
      return names;
    } finally {
      setLoadingTasks(false);
    }
  }, [id]);

  const calculate = async (): Promise<void> => {
    if (!id) {
      pushRef.current({ tone: "error", title: "Не указан идентификатор события" });
      return;
    }
    setCalculating(true);
    setLoadError(null);
    try {
      const [names, data] = await Promise.all([loadTaskNames(), api.schedule.calculate(id)]);
      setSchedule(data);
      void names;
      pushRef.current({
        tone: "ok",
        title: "Расчёт завершён",
        message: `Горизонт: ${data.project_duration} дн., критических: ${data.critical_path.length}`,
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setLoadError(message);
      pushRef.current({ tone: "error", title: "Ошибка расчёта расписания", message });
    } finally {
      setCalculating(false);
    }
  };

  const entries = schedule === null ? [] : Object.entries(schedule.schedule);
  // Порядок строк — порядок критического пути, затем остальные.
  const orderMap = new Map(
    schedule === null
      ? []
      : schedule.critical_path.map((taskId, index) => [taskId, index] as const),
  );
  const sortedEntries = [...entries].sort((a, b) => {
    const aOrder = orderMap.get(a[0]) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.get(b[0]) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return (taskNames[a[0]] ?? a[0]).localeCompare(taskNames[b[0]] ?? b[0]);
  });

  return (
    <section className="page">
      <div className="page__header">
        <h2 className="page__title">CPM-расписание</h2>
        <div className="toolbar">
          <Button variant="primary" onClick={() => void calculate()} disabled={calculating}>
            {calculating ? (
              <>
                <Spinner /> Расчёт…
              </>
            ) : (
              "Рассчитать"
            )}
          </Button>
        </div>
      </div>

      {loadingTasks && schedule === null && (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <Skeleton w="40%" h={20} />
          <Skeleton w="100%" h={40} />
          <Skeleton w="100%" h={40} />
        </div>
      )}

      {!loadingTasks && loadError !== null && schedule === null && (
        <EmptyState
          title="Не удалось рассчитать расписание"
          hint={loadError}
          action={
            <Button variant="primary" onClick={() => void calculate()}>
              Повторить
            </Button>
          }
        />
      )}

      {schedule === null && loadError === null && !loadingTasks && (
        <EmptyState
          title="Расписание ещё не рассчитано"
          hint="Нажмите «Рассчитать», чтобы построить CPM-план по задачам события."
        />
      )}

      {schedule !== null && (
        <>
          <p className="muted" style={{ fontSize: 18 }}>
            Горизонт проекта: <strong>{schedule.project_duration}</strong> дн.
          </p>

          <h3 style={{ marginTop: 0 }}>Критический путь</h3>
          {schedule.critical_path.length === 0 ? (
            <p className="muted">Критический путь пуст.</p>
          ) : (
            <div className="toolbar" style={{ flexWrap: "wrap" }}>
              {schedule.critical_path.map((taskId, index) => (
                <span key={taskId} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {index > 0 && <span className="muted">→</span>}
                  <Badge tone="critical">{taskNames[taskId] ?? taskId}</Badge>
                </span>
              ))}
            </div>
          )}

          <div className="card" style={{ marginTop: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Задача</th>
                  <th>Раннее начало</th>
                  <th>Раннее окончание</th>
                  <th>Позднее начало</th>
                  <th>Позднее окончание</th>
                  <th>Полный резерв</th>
                  <th>Свободный резерв</th>
                  <th>Критическая</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map(([taskId, item]) => (
                  <tr
                    key={taskId}
                    className={item.is_critical ? "table__row--critical" : undefined}
                  >
                    <td>{taskNames[taskId] ?? taskId}</td>
                    <td>{formatDay(item.earliest_start)}</td>
                    <td>{formatDay(item.earliest_finish)}</td>
                    <td>{formatDay(item.latest_start)}</td>
                    <td>{formatDay(item.latest_finish)}</td>
                    <td>{item.total_float}</td>
                    <td>{item.free_float}</td>
                    <td>
                      {item.is_critical ? (
                        <Badge tone="critical">да</Badge>
                      ) : (
                        <Badge tone="muted">нет</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
