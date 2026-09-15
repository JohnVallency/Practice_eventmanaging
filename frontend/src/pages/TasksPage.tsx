/**
 * Страница задач события /events/:id/tasks.
 * CRUD задач, управление зависимостями (FS/SS/FF/SF) и расчёт CPM.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { isAxiosError } from "axios";
import { useParams } from "react-router-dom";

import { api } from "../services/api";
import type { DependencyType, Task, TaskDependency } from "../types";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Skeleton,
  Spinner,
  useToast,
} from "../components/ui";

const DEP_TYPES: readonly DependencyType[] = ["FS", "SS", "FF", "SF"];

const SELECT_STYLE: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #E7E5E0",
  background: "#FFFFFF",
  font: "inherit",
  color: "inherit",
};

interface DepFormState {
  predecessorId: string;
  type: DependencyType;
  lagDays: string;
}

const EMPTY_DEP_FORM: DepFormState = { predecessorId: "", type: "FS", lagDays: "0" };

/** Достать человекочитаемое сообщение из ошибки API (в т.ч. detail из 400). */
function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (data !== null && typeof data === "object" && "detail" in data) {
      const detail: unknown = (data as { detail?: unknown }).detail;
      if (typeof detail === "string") {
        return detail;
      }
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

/** Смещение в днях → "день N" или "—". */
function formatDay(value: number | null): string {
  return value === null ? "—" : `день ${value}`;
}

export default function TasksPage() {
  const { id } = useParams<{ id: string }>();
  const { push } = useToast();
  // push может быть нестабилен между рендерами — держим его в ref для колбэков.
  const pushRef = useRef(push);
  useEffect(() => {
    pushRef.current = push;
  }, [push]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [calcBusy, setCalcBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDuration, setCreateDuration] = useState("1");
  const [createBusy, setCreateBusy] = useState(false);

  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editName, setEditName] = useState("");
  const [editDuration, setEditDuration] = useState("1");
  const [editBusy, setEditBusy] = useState(false);

  const [depsTask, setDepsTask] = useState<Task | null>(null);
  const [deps, setDeps] = useState<TaskDependency[]>([]);
  const [depsLoading, setDepsLoading] = useState(false);
  const [depForm, setDepForm] = useState<DepFormState>(EMPTY_DEP_FORM);
  const [depBusy, setDepBusy] = useState(false);

  const [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!id) {
      setLoadError("Не указан идентификатор события.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setTasks(await api.tasks.list(id));
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setLoadError(message);
      pushRef.current({ tone: "error", title: "Ошибка загрузки задач", message });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadDeps = useCallback(async (taskId: string): Promise<void> => {
    try {
      setDeps(await api.dependencies.list(taskId));
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Ошибка загрузки зависимостей",
        message: getErrorMessage(error),
      });
    }
  }, []);

  // Зависимости открытой задачи подгружаются при её выборе.
  useEffect(() => {
    if (!depsTask) {
      return;
    }
    let cancelled = false;
    setDepsLoading(true);
    api.dependencies
      .list(depsTask.id)
      .then((data) => {
        if (!cancelled) setDeps(data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        pushRef.current({
          tone: "error",
          title: "Ошибка загрузки зависимостей",
          message: getErrorMessage(error),
        });
      })
      .finally(() => {
        if (!cancelled) setDepsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [depsTask]);

  const calculateCpm = async (): Promise<void> => {
    if (!id) return;
    setCalcBusy(true);
    try {
      const data = await api.schedule.calculate(id);
      pushRef.current({
        tone: "ok",
        title: "CPM рассчитан",
        message: `Горизонт: ${data.project_duration} дн., критических: ${data.critical_path.length}`,
      });
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Ошибка расчёта CPM",
        message: getErrorMessage(error),
      });
    } finally {
      setCalcBusy(false);
    }
  };

  const submitCreate = async (): Promise<void> => {
    if (!id) return;
    const name = createName.trim();
    const duration = Number(createDuration);
    if (name.length === 0) {
      pushRef.current({ tone: "error", title: "Укажите название задачи" });
      return;
    }
    if (!Number.isInteger(duration) || duration < 1) {
      pushRef.current({ tone: "error", title: "Длительность — целое число, минимум 1 день" });
      return;
    }
    setCreateBusy(true);
    try {
      await api.tasks.create(id, { name, duration_days: duration });
      pushRef.current({ tone: "ok", title: "Задача добавлена", message: name });
      setCreateOpen(false);
      setCreateName("");
      setCreateDuration("1");
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось добавить задачу",
        message: getErrorMessage(error),
      });
    } finally {
      setCreateBusy(false);
    }
  };

  const openEdit = (task: Task): void => {
    setEditTask(task);
    setEditName(task.name);
    setEditDuration(String(task.duration_days));
  };

  const submitEdit = async (): Promise<void> => {
    if (!editTask) return;
    const name = editName.trim();
    const duration = Number(editDuration);
    if (name.length === 0) {
      pushRef.current({ tone: "error", title: "Укажите название задачи" });
      return;
    }
    if (!Number.isInteger(duration) || duration < 1) {
      pushRef.current({ tone: "error", title: "Длительность — целое число, минимум 1 день" });
      return;
    }
    setEditBusy(true);
    try {
      await api.tasks.update(editTask.id, { name, duration_days: duration });
      pushRef.current({ tone: "ok", title: "Задача обновлена" });
      setEditTask(null);
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось обновить задачу",
        message: getErrorMessage(error),
      });
    } finally {
      setEditBusy(false);
    }
  };

  const openDeps = (task: Task): void => {
    setDepsTask(task);
    setDeps([]);
    setDepForm(EMPTY_DEP_FORM);
  };

  const addDependency = async (): Promise<void> => {
    if (!depsTask) return;
    if (depForm.predecessorId.length === 0) {
      pushRef.current({ tone: "error", title: "Выберите задачу-предшественника" });
      return;
    }
    const lag = Number(depForm.lagDays);
    if (!Number.isInteger(lag) || lag < 0) {
      pushRef.current({ tone: "error", title: "Лаг — целое число, минимум 0" });
      return;
    }
    setDepBusy(true);
    try {
      await api.dependencies.create(depsTask.id, {
        predecessor_id: depForm.predecessorId,
        dependency_type: depForm.type,
        lag_days: lag,
      });
      pushRef.current({ tone: "ok", title: "Зависимость добавлена" });
      setDepForm((form) => ({ ...form, predecessorId: "" }));
      await reloadDeps(depsTask.id);
    } catch (error: unknown) {
      // Цикл от бэкенда приходит как 400 с detail — показываем текст в toast.
      pushRef.current({
        tone: "error",
        title: "Не удалось добавить зависимость",
        message: getErrorMessage(error),
      });
    } finally {
      setDepBusy(false);
    }
  };

  const removeDependency = async (dep: TaskDependency): Promise<void> => {
    if (!depsTask) return;
    try {
      await api.dependencies.remove(depsTask.id, dep.predecessor_id);
      pushRef.current({ tone: "ok", title: "Зависимость удалена" });
      await reloadDeps(depsTask.id);
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось удалить зависимость",
        message: getErrorMessage(error),
      });
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTask) return;
    setDeleteBusy(true);
    try {
      await api.tasks.delete(deleteTask.id);
      pushRef.current({ tone: "ok", title: "Задача удалена", message: deleteTask.name });
      const removedId = deleteTask.id;
      setDeleteTask(null);
      setDepsTask((current) => (current?.id === removedId ? null : current));
      setEditTask((current) => (current?.id === removedId ? null : current));
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось удалить задачу",
        message: getErrorMessage(error),
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  const nameById = new Map(tasks.map((task) => [task.id, task.name] as const));
  const predecessorOptions =
    depsTask === null ? [] : tasks.filter((task) => task.id !== depsTask.id);
  // По одному предшественнику в списке (DELETE удаляет связь по паре задача-предшественник).
  const uniqueDeps = deps.filter(
    (dep, index) => deps.findIndex((other) => other.predecessor_id === dep.predecessor_id) === index,
  );

  return (
    <section className="page">
      <div className="page__header">
        <h2 className="page__title">Задачи</h2>
        <div className="toolbar">
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            Добавить задачу
          </Button>
          <Button variant="ghost" onClick={() => void calculateCpm()} disabled={calcBusy}>
            {calcBusy ? (
              <>
                <Spinner /> Расчёт…
              </>
            ) : (
              "Рассчитать CPM"
            )}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <Skeleton w="40%" h={20} />
          <Skeleton w="100%" h={40} />
          <Skeleton w="100%" h={40} />
          <Skeleton w="100%" h={40} />
        </div>
      )}

      {!loading && loadError !== null && (
        <EmptyState
          title="Не удалось загрузить задачи"
          hint={loadError}
          action={
            <Button variant="primary" onClick={() => void load()}>
              Повторить
            </Button>
          }
        />
      )}

      {!loading && loadError === null && tasks.length === 0 && (
        <EmptyState
          title="Задач пока нет"
          hint="Добавьте первую задачу, чтобы построить план события."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Добавить задачу
            </Button>
          }
        />
      )}

      {!loading && loadError === null && tasks.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Длительность (дн.)</th>
                <th>Резерв</th>
                <th>Факт</th>
                <th>Критическая</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr
                  key={task.id}
                  className={task.is_critical ? "table__row--critical" : undefined}
                >
                  <td>{task.name}</td>
                  <td>{task.duration_days}</td>
                  <td>{task.total_float === null ? "—" : `${task.total_float} дн.`}</td>
                  <td>
                    {task.actual_start === null && task.actual_finish === null
                      ? "—"
                      : `${formatDay(task.actual_start)} – ${formatDay(task.actual_finish)}`}
                  </td>
                  <td>
                    {task.is_critical ? (
                      <Badge tone="critical">Критическая</Badge>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <div className="toolbar">
                      <Button variant="sm" onClick={() => openEdit(task)}>
                        Изменить
                      </Button>
                      <Button variant="sm" onClick={() => openDeps(task)}>
                        Зависимости
                      </Button>
                      <Button variant="sm" onClick={() => setDeleteTask(task)}>
                        Удалить
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={createOpen}
        title="Добавить задачу"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={() => void submitCreate()} disabled={createBusy}>
              {createBusy ? (
                <>
                  <Spinner /> Сохранение…
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <Field
            label="Название"
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            placeholder="Например, Подготовка площадки"
          />
          <Field
            label="Длительность (дней)"
            type="number"
            min={1}
            step={1}
            value={createDuration}
            onChange={(event) => setCreateDuration(event.target.value)}
            hint="Целое число, минимум 1 день"
          />
        </div>
      </Modal>

      <Modal
        open={editTask !== null}
        title={editTask === null ? "Изменить задачу" : `Изменить задачу «${editTask.name}»`}
        onClose={() => setEditTask(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditTask(null)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={() => void submitEdit()} disabled={editBusy}>
              {editBusy ? (
                <>
                  <Spinner /> Сохранение…
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <Field
            label="Название"
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
          />
          <Field
            label="Длительность (дней)"
            type="number"
            min={1}
            step={1}
            value={editDuration}
            onChange={(event) => setEditDuration(event.target.value)}
            hint="Целое число, минимум 1 день"
          />
        </div>
      </Modal>

      <Modal
        open={depsTask !== null}
        title={depsTask === null ? "Зависимости" : `Зависимости: ${depsTask.name}`}
        onClose={() => setDepsTask(null)}
        footer={
          <Button variant="ghost" onClick={() => setDepsTask(null)}>
            Закрыть
          </Button>
        }
      >
        {depsLoading ? (
          <Skeleton w="100%" h={72} />
        ) : (
          <>
            {uniqueDeps.length === 0 ? (
              <p className="muted" style={{ marginTop: 0 }}>
                У этой задачи пока нет предшественников.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: "0 0 16px",
                  padding: 0,
                  display: "grid",
                  gap: 6,
                }}
              >
                {uniqueDeps.map((dep) => (
                  <li
                    key={dep.predecessor_id}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ flex: 1 }}>
                      {nameById.get(dep.predecessor_id) ?? dep.predecessor_id}{" "}
                      <span className="muted">
                        ({dep.dependency_type}
                        {dep.lag_days !== 0 ? `, лаг ${dep.lag_days} дн.` : ""})
                      </span>
                    </span>
                    <Button
                      variant="sm"
                      aria-label="Удалить зависимость"
                      onClick={() => void removeDependency(dep)}
                    >
                      ×
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div
              style={{
                display: "grid",
                gap: 12,
                borderTop: "1px solid #E7E5E0",
                paddingTop: 12,
              }}
            >
              <strong>Добавить зависимость</strong>
              <Field label="Предшественник">
                <select
                  value={depForm.predecessorId}
                  onChange={(event) =>
                    setDepForm((form) => ({ ...form, predecessorId: event.target.value }))
                  }
                  style={SELECT_STYLE}
                >
                  <option value="">— выберите задачу —</option>
                  {predecessorOptions.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Тип связи">
                <select
                  value={depForm.type}
                  onChange={(event) =>
                    setDepForm((form) => ({
                      ...form,
                      type: event.target.value as DependencyType,
                    }))
                  }
                  style={SELECT_STYLE}
                >
                  {DEP_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Лаг (дней)"
                type="number"
                min={0}
                step={1}
                value={depForm.lagDays}
                onChange={(event) =>
                  setDepForm((form) => ({ ...form, lagDays: event.target.value }))
                }
                hint="0 — без задержки"
              />
              <Button variant="primary" onClick={() => void addDependency()} disabled={depBusy}>
                {depBusy ? (
                  <>
                    <Spinner /> Добавление…
                  </>
                ) : (
                  "Добавить зависимость"
                )}
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={deleteTask !== null}
        title="Удаление задачи"
        onClose={() => setDeleteTask(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTask(null)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} disabled={deleteBusy}>
              {deleteBusy ? (
                <>
                  <Spinner /> Удаление…
                </>
              ) : (
                "Удалить"
              )}
            </Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>Удалить задачу «{deleteTask?.name ?? ""}»?</p>
        <p className="muted">Её связи с другими задачами будут удалены вместе с ней.</p>
      </Modal>
    </section>
  );
}
