/**
 * Страница ресурсного расписания /events/:id/resource-schedule.
 * Серийный SGS (RCPSP) + панель загрузки ресурсов по дням (utilization).
 */

import { useCallback, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../services/api";
import { describeError } from "../services/errors";
import type {
  ResourceScheduleResponse,
  ResourceUtilizationResponse,
} from "../types";
import { Badge, Button, EmptyState, Skeleton, Spinner, useToast } from "../components/ui";

/** Смещение в днях → "день N" или "—". */
function formatDay(value: number | null): string {
  return value === null ? "—" : `день ${value}`;
}

/** Лимит дней, отображаемых полностью; дальше — срез с "…+K дней". */
const MAX_DAYS_SHOWN = 31;

/** Порог процента загрузки: ≤ 80 muted, 80–100 warn, > 100 critical. */
function utilizationTone(percent: number): "muted" | "warn" | "critical" {
  if (percent > 100) {
    return "critical";
  }
  if (percent >= 80) {
    return "warn";
  }
  return "muted";
}

export default function ResourceSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const { push } = useToast();
  const pushRef = useRef(push);
  // push может быть нестабилен между рендерами — держим его в ref для колбэков.

  const [schedule, setSchedule] = useState<ResourceScheduleResponse | null>(null);
  const [utilization, setUtilization] = useState<ResourceUtilizationResponse | null>(null);
  const [taskNames, setTaskNames] = useState<Record<string, string>>({});
  const [calculating, setCalculating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const calculate = useCallback(async (): Promise<void> => {
    if (!id) {
      pushRef.current({ tone: "error", title: "Не указан идентификатор события" });
      return;
    }
    setCalculating(true);
    setLoadError(null);
    try {
      const tasks = await api.tasks.listAll(id);
      const scheduleData = await api.resourcesSchedule.calculate(id);
      const utilizationData = await api.resourcesSchedule.utilization(id);
      setTaskNames(Object.fromEntries(tasks.map((task) => [task.id, task.name] as const)));
      setSchedule(scheduleData);
      setUtilization(utilizationData);
    } catch (error: unknown) {
      const message = describeError(error);
      setLoadError(message);
      pushRef.current({
        tone: "error",
        title: "Ошибка ресурсного расчёта",
        message,
      });
    } finally {
      setCalculating(false);
    }
  }, [id]);

  const scheduleEntries = schedule === null ? [] : Object.entries(schedule.schedule);
  const taskIds = scheduleEntries.map(([taskId]) => taskId);

  return (
    <section className="page">
      <div className="page__header">
        <div>
          <div className="eyebrow">RCPSP / сглаживание ресурсов</div>
          <h2 className="page__title">План с ресурсами</h2>
          <p className="muted">
            Расписание, пересобранное под доступность людей, техники и площадок по дням.
          </p>
        </div>
        <div className="toolbar">
          <Button variant="primary" onClick={() => void calculate()} disabled={calculating}>
            {calculating ? (
              <>
                <Spinner /> Расчёт…
              </>
            ) : (
              "Рассчитать с ресурсами"
            )}
          </Button>
        </div>
      </div>

      <div className="hint-panel" style={{ marginBottom: 16 }}>
        Без ограничений задачи идут параллельно. Здесь план пересобран так, чтобы суммарная
        потребность в каждом ресурсе не превышала его доступность в день — из-за этого задачи могут
        начинаться позже, чем в простом плане, а «Запас (полный)» может стать отрицательным — это
        нормально и означает, что ресурс — узкое место.
      </div>

      {calculating && schedule === null && (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <Skeleton w="40%" h={20} />
          <Skeleton w="100%" h={40} />
          <Skeleton w="100%" h={40} />
        </div>
      )}

      {!calculating && loadError !== null && schedule === null && (
        <EmptyState
          title="Не удалось рассчитать ресурсное расписание"
          hint={loadError}
          action={
            <Button variant="primary" onClick={() => void calculate()}>
              Повторить
            </Button>
          }
        />
      )}

      {schedule === null && loadError === null && !calculating && (
        <EmptyState
          title="Расписание не рассчитано"
          hint="Нажмите «Рассчитать с ресурсами», чтобы построить план с учётом доступности ресурсов."
        />
      )}

      {schedule !== null && taskIds.length === 0 && (
        <EmptyState title="Нет задач" hint="Добавьте задачи, чтобы рассчитать ресурсный план." />
      )}

      {schedule !== null && taskIds.length > 0 && (
        <>
          <p className="muted" style={{ fontSize: 17 }}>
            Ресурсный горизонт: <strong>{schedule.resource_project_duration}</strong> дн.
          </p>

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Задача</th>
                  <th>Факт. старт</th>
                  <th>Факт. финиш</th>
                  <th>Сдвиг из-за ресурсов</th>
                  <th>Критическая</th>
                </tr>
              </thead>
              <tbody>
                {scheduleEntries.map(([taskId, item]) => (
                  <tr
                    key={taskId}
                    className={item.is_critical ? "table__row--critical" : undefined}
                  >
                    <td>{taskNames[taskId] ?? taskId}</td>
                    <td>{formatDay(item.actual_start)}</td>
                    <td>{formatDay(item.actual_finish)}</td>
                    <td className={item.delay_days > 0 ? "danger-text" : undefined}>
                      {item.delay_days > 0 ? `+${item.delay_days} дн.` : "—"}
                    </td>
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

          <h3>Загрузка ресурсов</h3>
          {utilization === null || utilization.resources.length === 0 ? (
            <p className="muted">Нет данных о загрузке.</p>
          ) : (
            <div className="grid-cards">
              {utilization.resources.map((resource) => {
                const days = Object.keys(resource.allocated_by_day)
                  .map(Number)
                  .sort((a, b) => a - b);
                const shown = days.slice(0, MAX_DAYS_SHOWN);
                const hiddenCount = days.length - shown.length;
                return (
                  <div key={resource.resource_id} className="card" style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong>{resource.resource_name}</strong>
                      <span className="muted">
                        доступность {resource.availability_per_day}/день
                      </span>
                      <span
                        title={`Пик: ${resource.peak_allocated} из ${resource.availability_per_day} единиц в день ${
                          resource.peak_day ?? "—"
                        } — ${Math.round(resource.peak_utilization_percent)}% доступности`}
                      >
                        <Badge tone={utilizationTone(resource.peak_utilization_percent)}>
                          пик {resource.peak_allocated} ·{" "}
                          {Math.round(resource.peak_utilization_percent)}%
                        </Badge>
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", flexWrap: "wrap" }}>
                      {shown.map((day) => {
                        const allocated = resource.allocated_by_day[String(day)] ?? 0;
                        const percent =
                          resource.availability_per_day > 0
                            ? (allocated / resource.availability_per_day) * 100
                            : 0;
                        const over = percent > 100;
                        return (
                          <div
                            key={day}
                            title={`день ${day}: ${allocated}/${resource.availability_per_day}`}
                            style={{
                              width: 18,
                              height: 64,
                              display: "flex",
                              alignItems: "flex-end",
                              background: "#f1eadd",
                              borderRadius: 3,
                            }}
                          >
                            <div
                              className={over ? "over" : undefined}
                              style={{
                                width: "100%",
                                height: `${Math.min(percent, 100)}%`,
                                background: over ? "#a32817" : "#17140f",
                                borderRadius: 3,
                                transition: "width 300ms",
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {shown.length > 0
                        ? `дни ${shown[0]}–${shown[shown.length - 1]}${
                            hiddenCount > 0 ? `, …+${hiddenCount} дней` : ""
                          }`
                        : "Нет загрузки"}
                      {resource.peak_day !== null ? ` · пик: день ${resource.peak_day}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
