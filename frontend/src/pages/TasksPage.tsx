/**
 * Страница задач события /events/:id/tasks с расчётом CPM.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../services/api";
import type { ScheduleCalculationResponse, Task } from "../types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

export default function TasksPage() {
  const { id } = useParams<{ id: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cpm, setCpm] = useState<ScheduleCalculationResponse | null>(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Не указан идентификатор события.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    api.tasks
      .list(id)
      .then((data) => {
        if (!cancelled) setTasks(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const calculateCpm = (): void => {
    if (!id) return;

    setCalculating(true);
    api.schedule
      .calculate(id)
      .then((data) => setCpm(data))
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setCalculating(false));
  };

  return (
    <section className="page">
      <h2 className="page__title">Задачи</h2>
      {error && <p className="alert">{error}</p>}
      {loading && <p className="muted">Загрузка…</p>}
      {!loading && !error && tasks.length === 0 && <p className="muted">Задач пока нет.</p>}
      {!loading && !error && tasks.length > 0 && (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Длительность (дн.)</th>
                <th>Критическая</th>
                <th>Полный резерв</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={String(task.id)}>
                  <td>{task.name}</td>
                  <td>{task.duration_days}</td>
                  <td>
                    <span className={`badge${task.is_critical ? " badge--critical" : ""}`}>
                      {task.is_critical ? "да" : "нет"}
                    </span>
                  </td>
                  <td>{task.total_float}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            <button type="button" className="button" onClick={calculateCpm} disabled={calculating}>
              {calculating ? "Расчёт…" : "Рассчитать CPM"}
            </button>
          </div>
          {cpm && (
            <p className="cpm-summary">
              Критический путь: <strong>{cpm.critical_path.length}</strong> задач · Длительность
              проекта: <strong>{cpm.project_duration}</strong> дн.
            </p>
          )}
        </>
      )}
    </section>
  );
}
