import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { FiEdit2, FiTrash2, FiLink, FiSearch } from "react-icons/fi";

import { api } from "../services/api";
import { describeError } from "../services/errors";
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

const DEP_TYPE_LABELS: Record<DependencyType, string> = {
  FS: "Финиш–Старт (после окончания)",
  SS: "Старт–Старт (одновременно)",
  FF: "Финиш–Финиш (вместе закончить)",
  SF: "Старт–Финиш (поздний финиш предшественника)",
};

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

export default function TasksPage() {
  const { id } = useParams<{ id: string }>();
  const { push } = useToast();
  const pushRef = useRef(push);
  useEffect(() => {
    pushRef.current = push;
  }, [push]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Фильтры и поиск
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "critical" | "float">("all");

  const [calcBusy, setCalcBusy] = useState(false);
  const [showCalcHint, setShowCalcHint] = useState(false);

  // Создание
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDuration, setCreateDuration] = useState("1");
  const [createPredecessorId, setCreatePredecessorId] = useState("");
  const [createDepType, setCreateDepType] = useState<DependencyType>("FS");
  const [createDepLag, setCreateDepLag] = useState("0");
  const [createBusy, setCreateBusy] = useState(false);

  // Редактирование
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editName, setEditName] = useState("");
  const [editDuration, setEditDuration] = useState("1");
  const [editBusy, setEditBusy] = useState(false);

  // Зависимости
  const [depsTask, setDepsTask] = useState<Task | null>(null);
  const [deps, setDeps] = useState<TaskDependency[]>([]);
  const [depsLoading, setDepsLoading] = useState(false);
  const [depForm, setDepForm] = useState<DepFormState>(EMPTY_DEP_FORM);
  const [depBusy, setDepBusy] = useState(false);

  // Удаление
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
      const data = await api.tasks.list(id);
      setTasks(data);
    } catch (error: unknown) {
      const message = describeError(error);
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
    setDepsLoading(true);
    try {
      const list = await api.dependencies.list(taskId);
      setDeps(list);
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Ошибка загрузки зависимостей",
        message: describeError(error),
      });
    } finally {
      setDepsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (depsTask !== null) {
      void reloadDeps(depsTask.id);
    } else {
      setDeps([]);
      setDepForm(EMPTY_DEP_FORM);
    }
  }, [depsTask, reloadDeps]);

  // Фильтрация задач
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (filterType === "critical") return task.is_critical;
      if (filterType === "float") return task.total_float !== null && task.total_float > 0;
      return true;
    });
  }, [tasks, searchQuery, filterType]);

  // Статистика
  const stats = useMemo(() => {
    const total = tasks.length;
    const critical = tasks.filter((t) => t.is_critical).length;
    const totalDuration = tasks.reduce((sum, t) => sum + t.duration_days, 0);
    return { total, critical, totalDuration };
  }, [tasks]);

  const calculateCpm = async (): Promise<void> => {
    if (!id) return;
    setCalcBusy(true);
    try {
      const data = await api.schedule.calculate(id);
      pushRef.current({
        tone: "ok",
        title: "План пересчитан",
        message: `Горизонт проекта: ${data.project_duration} дн., на критическом пути: ${data.critical_path.length} задач`,
      });
      setShowCalcHint(true);
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Ошибка расчёта плана",
        message: describeError(error),
      });
    } finally {
      setCalcBusy(false);
    }
  };

  const submitCreate = async (): Promise<void> => {
    if (!id) return;
    const name = createName.trim();
    if (!name) {
      pushRef.current({ tone: "error", title: "Укажите название задачи" });
      return;
    }
    const duration = parseInt(createDuration, 10);
    if (Number.isNaN(duration) || duration < 1) {
      pushRef.current({ tone: "error", title: "Длительность — целое число, минимум 1 день" });
      return;
    }

    setCreateBusy(true);
    try {
      const newTask = await api.tasks.create(id, { name, duration_days: duration });
      
      // Если указан предшественник — создаём связь
      if (createPredecessorId) {
        const lag = parseInt(createDepLag, 10);
        await api.dependencies.create(newTask.id, {
          predecessor_id: createPredecessorId,
          dependency_type: createDepType,
          lag_days: Number.isNaN(lag) ? 0 : Math.max(0, lag),
        });
      }

      pushRef.current({ tone: "ok", title: "Задача добавлена", message: name });
      setCreateOpen(false);
      setCreateName("");
      setCreateDuration("1");
      setCreatePredecessorId("");
      setCreateDepType("FS");
      setCreateDepLag("0");
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось создать задачу",
        message: describeError(error),
      });
    } finally {
      setCreateBusy(false);
    }
  };

  const openEdit = (task: Task) => {
    setEditTask(task);
    setEditName(task.name);
    setEditDuration(String(task.duration_days));
  };

  const submitEdit = async (): Promise<void> => {
    if (editTask === null) return;
    const name = editName.trim();
    if (!name) {
      pushRef.current({ tone: "error", title: "Укажите название задачи" });
      return;
    }
    const duration = parseInt(editDuration, 10);
    if (Number.isNaN(duration) || duration < 1) {
      pushRef.current({ tone: "error", title: "Длительность — целое число, минимум 1 день" });
      return;
    }

    setEditBusy(true);
    try {
      await api.tasks.update(editTask.id, { name, duration_days: duration });
      pushRef.current({ tone: "ok", title: "Задача обновлена", message: name });
      setEditTask(null);
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось обновить задачу",
        message: describeError(error),
      });
    } finally {
      setEditBusy(false);
    }
  };

  const openDeps = (task: Task) => {
    setDepsTask(task);
  };

  const submitAddDep = async (): Promise<void> => {
    if (depsTask === null) return;
    if (!depForm.predecessorId) {
      pushRef.current({ tone: "error", title: "Выберите задачу-предшественника" });
      return;
    }
    const lag = parseInt(depForm.lagDays, 10);
    if (Number.isNaN(lag) || lag < 0) {
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
      pushRef.current({ tone: "ok", title: "Связь добавлена" });
      setDepForm(EMPTY_DEP_FORM);
      await reloadDeps(depsTask.id);
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось добавить связь",
        message: describeError(error),
      });
    } finally {
      setDepBusy(false);
    }
  };

  const removeDep = async (predecessorId: string): Promise<void> => {
    if (depsTask === null) return;
    setDepBusy(true);
    try {
      await api.dependencies.remove(depsTask.id, predecessorId);
      pushRef.current({ tone: "ok", title: "Связь удалена" });
      await reloadDeps(depsTask.id);
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось удалить связь",
        message: describeError(error),
      });
    } finally {
      setDepBusy(false);
    }
  };

  const submitDelete = async (): Promise<void> => {
    if (deleteTask === null) return;
    setDeleteBusy(true);
    try {
      await api.tasks.delete(deleteTask.id);
      pushRef.current({ tone: "ok", title: "Задача удалена", message: deleteTask.name });
      setDeleteTask(null);
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось удалить задачу",
        message: describeError(error),
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  const taskNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) {
      map.set(t.id, t.name);
    }
    return map;
  }, [tasks]);

  return (
    <section className="page">
      <div className="page__header">
        <div>
          <h2 className="page__title">Задачи события</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Всего: {stats.total} · Критических: {stats.critical} · Суммарно: {stats.totalDuration} дн.
          </div>
        </div>

        <div className="toolbar">
          <Button variant="ghost" onClick={() => void calculateCpm()} disabled={calcBusy}>
            {calcBusy ? (
              <>
                <Spinner /> Расчёт…
              </>
            ) : (
              "Рассчитать план"
            )}
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            + Добавить задачу
          </Button>
        </div>
      </div>

      {showCalcHint && (
        <div className="hint-panel" style={{ marginBottom: 16 }}>
          <strong>Почему задачи помечены критическими?</strong>
          <div style={{ marginTop: 6 }}>
            Критическая задача — та, у которой нет запаса: любая задержка двигает весь проект.
            Если задач несколько и они не связаны зависимостями, каждая может сдвинуть проект —
            поэтому помечены все. Свяжите задачи зависимостями на странице «Граф» — и критический
            путь станет единственным и понятным.
          </div>
        </div>
      )}

      {/* Поиск и фильтры */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <FiSearch style={{ position: "absolute", left: 12, top: 12, color: "#6B7280" }} />
          <input
            type="text"
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ ...SELECT_STYLE, paddingLeft: 36 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant={filterType === "all" ? "primary" : "ghost"}
            onClick={() => setFilterType("all")}
          >
            Все ({tasks.length})
          </Button>
          <Button
            variant={filterType === "critical" ? "primary" : "ghost"}
            onClick={() => setFilterType("critical")}
          >
            Критические ({stats.critical})
          </Button>
          <Button
            variant={filterType === "float" ? "primary" : "ghost"}
            onClick={() => setFilterType("float")}
          >
            С запасом ({tasks.filter((t) => t.total_float !== null && t.total_float > 0).length})
          </Button>
        </div>
      </div>

      {loading && (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <Skeleton w="100%" h={44} />
          <Skeleton w="100%" h={44} />
          <Skeleton w="100%" h={44} />
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
          title="В событии пока нет задач"
          hint="Добавьте первую задачу, укажите её длительность и свяжите с другими задачами."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Добавить задачу
            </Button>
          }
        />
      )}

      {!loading && loadError === null && tasks.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Длительность</th>
                <th>Запас</th>
                <th>План</th>
                <th>Статус</th>
                <th style={{ textAlign: "right" }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => (
                <tr
                  key={task.id}
                  className={task.is_critical ? "table__row--critical" : undefined}
                >
                  <td style={{ fontWeight: 500 }}>{task.name}</td>
                  <td>{task.duration_days} дн.</td>
                  <td>
                    {task.total_float === null ? (
                      "—"
                    ) : task.total_float > 0 ? (
                      <Badge tone="ok">{`+${task.total_float} дн.`}</Badge>
                    ) : (
                      <span className="muted">0 дн.</span>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {task.actual_start === null && task.actual_finish === null
                      ? "—"
                      : `день ${task.actual_start}–${task.actual_finish}`}
                  </td>
                  <td>
                    {task.is_critical ? (
                      <Badge tone="critical">Критическая</Badge>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 4 }}>
                      <button
                        className="btn btn--ghost"
                        style={{ padding: "6px 10px" }}
                        onClick={() => openEdit(task)}
                        title="Редактировать"
                      >
                        <FiEdit2 size={14} />
                      </button>
                      <button
                        className="btn btn--ghost"
                        style={{ padding: "6px 10px" }}
                        onClick={() => openDeps(task)}
                        title="Связи задачи"
                      >
                        <FiLink size={14} />
                      </button>
                      <button
                        className="btn btn--ghost"
                        style={{ padding: "6px 10px", color: "#DC2626" }}
                        onClick={() => setDeleteTask(task)}
                        title="Удалить"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Модалка создания задачи */}
      <Modal
        open={createOpen}
        title="Новая задача"
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
                "Создать задачу"
              )}
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 16 }}>
          <Field
            label="Название задачи"
            placeholder="Например: Аренда зала, Подготовка презентации"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />

          <Field
            label="Длительность (в днях)"
            type="number"
            min="1"
            value={createDuration}
            onChange={(e) => setCreateDuration(e.target.value)}
            hint="Сколько рабочих дней займёт выполнение"
          />

          {tasks.length > 0 && (
            <div style={{ borderTop: "1px solid #E7E5E0", paddingTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Предшественник (опционально)
              </div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                Какая задача должна завершиться до старта этой:
              </div>

              <select
                style={{ ...SELECT_STYLE, marginBottom: 12 }}
                value={createPredecessorId}
                onChange={(e) => setCreatePredecessorId(e.target.value)}
              >
                <option value="">Без предшественника (старт в день 0)</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.duration_days} дн.)
                  </option>
                ))}
              </select>

              {createPredecessorId && (
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 13, color: "#6B7280", display: "block", marginBottom: 4 }}>
                      Тип связи
                    </label>
                    <select
                      style={SELECT_STYLE}
                      value={createDepType}
                      onChange={(e) => setCreateDepType(e.target.value as DependencyType)}
                    >
                      {DEP_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {DEP_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 13, color: "#6B7280", display: "block", marginBottom: 4 }}>
                      Лаг (дней)
                    </label>
                    <input
                      type="number"
                      min="0"
                      style={SELECT_STYLE}
                      value={createDepLag}
                      onChange={(e) => setCreateDepLag(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Модалка редактирования задачи */}
      <Modal
        open={editTask !== null}
        title="Редактировать задачу"
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
        <div style={{ display: "grid", gap: 16 }}>
          <Field
            label="Название задачи"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />

          <Field
            label="Длительность (в днях)"
            type="number"
            min="1"
            value={editDuration}
            onChange={(e) => setEditDuration(e.target.value)}
          />
        </div>
      </Modal>

      {/* Модалка связей задачи */}
      <Modal
        open={depsTask !== null}
        title={depsTask ? `Связи задачи «${depsTask.name}»` : "Связи"}
        onClose={() => setDepsTask(null)}
        footer={
          <Button variant="primary" onClick={() => setDepsTask(null)}>
            Готово
          </Button>
        }
      >
        <div style={{ display: "grid", gap: 20 }}>
          {/* Текущие связи */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Предшественники этой задачи:
            </div>
            {depsLoading && <Skeleton w="100%" h={40} />}
            {!depsLoading && deps.length === 0 && (
              <div className="muted" style={{ fontSize: 13, padding: "8px 0" }}>
                Предшественников нет — задача стартует в день 0.
              </div>
            )}
            {!depsLoading && deps.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {deps.map((dep) => {
                  const predName = taskNameById.get(dep.predecessor_id) ?? dep.predecessor_id;
                  const label = DEP_TYPE_LABELS[dep.dependency_type as DependencyType] ?? dep.dependency_type;
                  return (
                    <div
                      key={`${dep.predecessor_id}->${dep.successor_id}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: "#F7F6F3",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <strong>{predName}</strong>
                        <span className="muted" style={{ marginLeft: 8 }}>
                          {label} {dep.lag_days > 0 ? `+${dep.lag_days} дн.` : ""}
                        </span>
                      </div>
                      <button
                        className="btn btn--ghost"
                        style={{ padding: "4px 8px", color: "#DC2626" }}
                        onClick={() => void removeDep(dep.predecessor_id)}
                        disabled={depBusy}
                        title="Удалить связь"
                      >
                        <FiTrash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Добавление связи */}
          <div style={{ borderTop: "1px solid #E7E5E0", paddingTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              Добавить предшественника:
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <select
                style={SELECT_STYLE}
                value={depForm.predecessorId}
                onChange={(e) => setDepForm((prev) => ({ ...prev, predecessorId: e.target.value }))}
              >
                <option value="">Выберите задачу-предшественника...</option>
                {tasks
                  .filter((t) => depsTask && t.id !== depsTask.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.duration_days} дн.)
                    </option>
                  ))}
              </select>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <select
                  style={SELECT_STYLE}
                  value={depForm.type}
                  onChange={(e) =>
                    setDepForm((prev) => ({ ...prev, type: e.target.value as DependencyType }))
                  }
                >
                  {DEP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {DEP_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="0"
                  placeholder="Лаг"
                  style={SELECT_STYLE}
                  value={depForm.lagDays}
                  onChange={(e) => setDepForm((prev) => ({ ...prev, lagDays: e.target.value }))}
                />
              </div>

              <Button variant="primary" onClick={() => void submitAddDep()} disabled={depBusy}>
                {depBusy ? <Spinner /> : "+ Добавить связь"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Модалка подтверждения удаления */}
      <Modal
        open={deleteTask !== null}
        title="Удалить задачу?"
        onClose={() => setDeleteTask(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTask(null)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={() => void submitDelete()} disabled={deleteBusy}>
              {deleteBusy ? <Spinner /> : "Удалить"}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Вы уверены, что хотите удалить задачу «<strong>{deleteTask?.name}</strong>»?
        </p>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Связи этой задачи с другими тоже удалятся. Расписание потребуется пересчитать.
        </p>
      </Modal>
    </section>
  );
}
