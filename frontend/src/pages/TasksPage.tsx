/**
 * Рабочая область задач события (без канбан-доски).
 *
 * Один компонент обслуживает четыре раздела, различаемых по URL:
 *   /events/:id/tasks        — все задачи (список с деревом подзадач)
 *   /events/:id/tasks/new    — страница создания задачи (+ зависимости)
 *   /events/:id/tasks/active — задачи в работе и ожидающие старта
 *   /events/:id/tasks/done   — завершённые и отменённые
 *
 * Разделение по URL, а не по табам состояния: ссылки можно шарить,
 * сайдбар подсвечивает активный раздел, React Router матчит точно.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiArchive,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiCopy,
  FiLink,
  FiPlus,
  FiTrash2,
  FiUser,
  FiZap,
} from "react-icons/fi";

import { api } from "../services/api";
import { describeError } from "../services/errors";
import type { Resource, Task, TaskDependency, TaskPriority, TaskStatus } from "../types";
import { Badge, Button, EmptyState, Spinner, useToast } from "../components/ui";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Не начата",
  in_progress: "В работе",
  done: "Завершена",
  cancelled: "Отменена",
};

const PRIORITIES: { id: TaskPriority; label: string }[] = [
  { id: "high", label: "Высокий" },
  { id: "medium", label: "Средний" },
  { id: "low", label: "Низкий" },
];

/** Резервный список людей, если у события ещё нет ресурсов-исполнителей. */
const FALLBACK_PEOPLE = ["Анна", "Иван", "Мария", "Алексей"];

function deadlineTone(task: Task): "late" | "soon" | "normal" {
  if (!task.due_date || task.status === "done" || task.status === "cancelled") return "normal";
  const diff = new Date(task.due_date).getTime() - Date.now();
  return diff < 0 ? "late" : diff <= 86400000 ? "soon" : "normal";
}

function formatDueDate(value: string | null): string {
  if (!value) return "Без срока";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(value));
}

export type TaskSection = "all" | "new" | "active" | "done";

/** Общее состояние задач события для всех разделов. */
function useTaskWorkspace(eventId: string | undefined) {
  const { push } = useToast();
  const pushRef = useRef(push);
  useEffect(() => { pushRef.current = push; }, [push]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<string[]>(FALLBACK_PEOPLE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [taskData, resources] = await Promise.all([
        api.tasks.listAll(eventId),
        api.resources.list(eventId).catch(() => [] as Resource[]),
      ]);
      setTasks(taskData);
      const names = resources
        .filter((item) => item.type === "human")
        .map((item) => item.name);
      setPeople(names.length > 0 ? [...new Set(names)] : FALLBACK_PEOPLE);
    } catch (error: unknown) {
      pushRef.current({ tone: "error", title: "Не удалось загрузить задачи", message: describeError(error) });
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  /** Обновление задачи + пересчёт CPM, если изменение влияет на план. */
  const updateTask = useCallback(async (task: Task, patch: Partial<Task>): Promise<void> => {
    try {
      const updated = await api.tasks.update(task.id, patch);
      setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (patch.status !== undefined || patch.duration_days !== undefined || patch.parent_id !== undefined) {
        await api.schedule.calculate(task.event_id).catch(() => undefined);
        await load();
      }
    } catch (error: unknown) {
      pushRef.current({ tone: "error", title: "Не удалось обновить задачу", message: describeError(error) });
    }
  }, [load]);

  /**
   * Создание задачи с предшественниками: сначала POST /tasks,
   * затем для каждого выбранного предшественника связь FS с лагом 0.
   */
  const createTask = useCallback(
    async (
      payload: {
        name: string; description: string; duration_days: number; priority: TaskPriority;
        due_date: string | null; assignee: string | null; parent_id: string | null; tags: string[];
      },
      predecessors: string[] = [],
    ): Promise<Task | null> => {
      if (!eventId) return null;
      setBusy(true);
      try {
        const created = await api.tasks.create(eventId, { ...payload });
        for (const predecessorId of predecessors) {
          await api.dependencies
            .create(created.id, { predecessor_id: predecessorId, dependency_type: "FS", lag_days: 0 })
            .catch(() => undefined);
        }
        await api.schedule.calculate(eventId).catch(() => undefined);
        await load();
        pushRef.current({
          tone: "ok",
          title: "Задача создана",
          message: predecessors.length > 0 ? `Связей добавлено: ${predecessors.length}` : payload.name,
        });
        return created;
      } catch (error: unknown) {
        pushRef.current({ tone: "error", title: "Не удалось создать задачу", message: describeError(error) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [eventId, load],
  );

  const deleteTask = useCallback(async (task: Task): Promise<void> => {
    setBusy(true);
    try {
      await api.tasks.delete(task.id);
      await api.schedule.calculate(task.event_id).catch(() => undefined);
      await load();
      pushRef.current({ tone: "ok", title: "Задача удалена" });
    } catch (error: unknown) {
      pushRef.current({ tone: "error", title: "Не удалось удалить задачу", message: describeError(error) });
    } finally {
      setBusy(false);
    }
  }, [load]);

  const duplicateTask = useCallback(async (task: Task): Promise<void> => {
    if (!eventId) return;
    try {
      await api.tasks.create(eventId, {
        name: `${task.name} (копия)`,
        description: task.description ?? "",
        duration_days: task.duration_days,
        priority: task.priority,
        due_date: task.due_date,
        assignee: task.assignee,
        parent_id: task.parent_id,
        tags: task.tags,
      });
      await load();
      pushRef.current({ tone: "ok", title: "Копия создана" });
    } catch (error: unknown) {
      pushRef.current({ tone: "error", title: "Не удалось создать копию", message: describeError(error) });
    }
  }, [eventId, load]);

  return { tasks, people, loading, busy, load, updateTask, createTask, deleteTask, duplicateTask };
}

/** Счётчик связей каждой задачи (число входящих + исходящих рёбер). */
function dependencyCounts(tasks: Task[], deps: TaskDependency[]): Map<string, number> {
  const ids = new Set(tasks.map((task) => task.id));
  const counts = new Map<string, number>();
  for (const dep of deps) {
    if (ids.has(dep.predecessor_id)) counts.set(dep.predecessor_id, (counts.get(dep.predecessor_id) ?? 0) + 1);
    if (ids.has(dep.successor_id)) counts.set(dep.successor_id, (counts.get(dep.successor_id) ?? 0) + 1);
  }
  return counts;
}

export default function TasksPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  /** Активный раздел определяется по пути, а не по состоянию таба. */
  const section: TaskSection = useMemo(() => {
    const rest = location.pathname.replace(`/events/${id}/tasks`, "");
    if (rest.startsWith("/new")) return "new";
    if (rest.startsWith("/active")) return "active";
    if (rest.startsWith("/done")) return "done";
    return "all";
  }, [location.pathname, id]);

  const workspace = useTaskWorkspace(id);
  const { tasks, people, loading, busy, updateTask, createTask, deleteTask, duplicateTask } = workspace;

  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "all">("all");
  const [assignee, setAssignee] = useState<string | "all">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deps, setDeps] = useState<TaskDependency[]>([]);

  /** Связи нужны для бейджей «зависит от N» — тянутся один раз на список. */
  const refreshDeps = useCallback(async (): Promise<void> => {
    if (!id) return;
    try {
      const lists = await Promise.all(tasks.map((task) => api.dependencies.list(task.id).catch(() => [])));
      setDeps(lists.flat());
    } catch {
      setDeps([]);
    }
  }, [id, tasks]);

  useEffect(() => { void refreshDeps(); }, [refreshDeps]);

  const counts = useMemo(() => dependencyCounts(tasks, deps), [tasks, deps]);

  const filtered = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (showArchived || !task.archived) &&
          `${task.name} ${task.description ?? ""}`.toLowerCase().includes(query.toLowerCase()) &&
          (priority === "all" || task.priority === priority) &&
          (assignee === "all" || task.assignee === assignee),
      ),
    [tasks, query, priority, assignee, showArchived],
  );

  const childrenOf = useCallback(
    (parentId: string): Task[] => filtered.filter((task) => task.parent_id === parentId),
    [filtered],
  );

  const drawerTask = useMemo(() => tasks.find((task) => task.id === drawerId) ?? null, [drawerId, tasks]);

  const stats = useMemo(
    () => ({
      total: tasks.filter((task) => !task.archived).length,
      active: tasks.filter((task) => task.status === "in_progress").length,
      pending: tasks.filter((task) => task.status === "todo").length,
      done: tasks.filter((task) => task.status === "done").length,
      late: tasks.filter((task) => deadlineTone(task) === "late").length,
      unassigned: tasks.filter((task) => !task.archived && task.status !== "done" && task.status !== "cancelled" && !task.assignee).length,
    }),
    [tasks],
  );

  const handleStatus = useCallback(
    (task: Task, status: TaskStatus) => {
      if (task.status !== status) void updateTask(task, { status });
    },
    [updateTask],
  );

  const handleDelete = useCallback(
    (task: Task) => {
      if (window.confirm(`Удалить задачу «${task.name}»?`)) void deleteTask(task);
      setDrawerId(null);
    },
    [deleteTask],
  );

  const base = id ? `/events/${id}/tasks` : "/events";

  return (
    <section className="page tasks-workspace">
      {section === "new" ? (
        <TaskCreateForm
          eventId={id ?? ""}
          tasks={tasks}
          people={people}
          busy={busy}
          onSubmit={createTask}
          onCancel={() => navigate(base)}
          onCreated={() => navigate(base)}
        />
      ) : (
        <>
          <div className="page__header">
            <div>
              <div className="eyebrow">Задачи мероприятия</div>
              <h2 className="page__title">
                {section === "all" ? "Все задачи" : section === "active" ? "Задачи в работе" : "Завершённые задачи"}
              </h2>
            </div>
            <div className="toolbar">
              <Link to={`${base}/new`}>
                <Button>
                  <FiPlus /> Новая задача
                </Button>
              </Link>
              <Link to={id ? `/events/${id}/graph` : "/events"}>
                <Button variant="ghost">
                  <FiZap /> Граф зависимостей
                </Button>
              </Link>
            </div>
          </div>

          <nav className="task-tabs">
            <Link to={base} className={`task-tab ${section === "all" ? "task-tab--active" : ""}`}>
              Все задачи <span>{stats.total}</span>
            </Link>
            <Link to={`${base}/active`} className={`task-tab ${section === "active" ? "task-tab--active" : ""}`}>
              В работе <span>{stats.active + stats.pending}</span>
            </Link>
            <Link to={`${base}/done`} className={`task-tab ${section === "done" ? "task-tab--active" : ""}`}>
              Завершённые <span>{stats.done}</span>
            </Link>
          </nav>

          {loading ? (
            <div className="card tasks-loading"><Spinner /> Загружаем задачи…</div>
          ) : section === "active" ? (
            <ActiveTasksView
              tasks={filtered}
              childrenOf={childrenOf}
              counts={counts}
              onOpen={setDrawerId}
              onStatus={handleStatus}
              expanded={expanded}
              onToggle={setExpanded}
            />
          ) : section === "done" ? (
            <DoneTasksView
              tasks={filtered}
              childrenOf={childrenOf}
              counts={counts}
              onOpen={setDrawerId}
              expanded={expanded}
              onToggle={setExpanded}
            />
          ) : (
            <>
              <div className="task-filter-bar">
                <input
                  className="task-filter-bar__search"
                  placeholder="Поиск по названию или описанию…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority | "all")}>
                  <option value="all">Любой приоритет</option>
                  {PRIORITIES.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
                <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                  <option value="all">Все исполнители</option>
                  {people.map((person) => (
                    <option key={person} value={person}>{person}</option>
                  ))}
                </select>
                <label className="task-filter-bar__check">
                  <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                  Показать архив
                </label>
                <span className="task-filter-bar__hint">
                  {stats.unassigned > 0 && `Без исполнителя: ${stats.unassigned} · `}Просрочено: {stats.late}
                </span>
              </div>
              <AllTasksView
                tasks={filtered}
                childrenOf={childrenOf}
                counts={counts}
                onOpen={setDrawerId}
                onStatus={handleStatus}
                expanded={expanded}
                onToggle={setExpanded}
              />
            </>
          )}

          {drawerTask && (
            <TaskDrawer
              task={drawerTask}
              subtasks={tasks.filter((item) => item.parent_id === drawerTask.id)}
              people={people}
              busy={busy}
              onClose={() => setDrawerId(null)}
              onUpdate={(patch) => void updateTask(drawerTask, patch)}
              onDelete={() => handleDelete(drawerTask)}
              onDuplicate={() => void duplicateTask(drawerTask)}
              onAddSubtask={() => navigate(`${base}/new?parent=${drawerTask.id}`)}
            />
          )}
        </>
      )}
    </section>
  );
}

const toggleIn = (
  id: string,
  current: Set<string>,
  onToggle: (updater: (current: Set<string>) => Set<string>) => void,
): void =>
  onToggle(() => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

function AllTasksView(props: {
  tasks: Task[];
  childrenOf: (parentId: string) => Task[];
  counts: Map<string, number>;
  onOpen: (id: string) => void;
  onStatus: (task: Task, status: TaskStatus) => void;
  expanded: Set<string>;
  onToggle: (updater: (current: Set<string>) => Set<string>) => void;
}): JSX.Element {
  const { tasks, childrenOf, counts, onOpen, onStatus, expanded, onToggle } = props;
  const roots = tasks.filter((task) => !task.parent_id);

  if (roots.length === 0) {
    return (
      <EmptyState
        title="Пока нет задач"
        hint="Начните с ключевых этапов мероприятия: брифинг, площадка, подрядчики, программа."
        action={<Link to={window.location.pathname.replace(/\/$/, "") + "/new"}><Button><FiPlus /> Создать первую задачу</Button></Link>}
      />
    );
  }

  return (
    <div className="task-list">
      {roots.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          children={childrenOf(task.id)}
          dependencyCount={counts.get(task.id) ?? 0}
          onOpen={onOpen}
          onStatus={onStatus}
          expanded={expanded.has(task.id)}
          onToggle={() => toggleIn(task.id, expanded, onToggle)}
        />
      ))}
    </div>
  );
}

function ActiveTasksView(props: {
  tasks: Task[];
  childrenOf: (parentId: string) => Task[];
  counts: Map<string, number>;
  onOpen: (id: string) => void;
  onStatus: (task: Task, status: TaskStatus) => void;
  expanded: Set<string>;
  onToggle: (updater: (current: Set<string>) => Set<string>) => void;
}): JSX.Element {
  const { tasks, childrenOf, counts, onOpen, onStatus, expanded, onToggle } = props;
  const inProgress = tasks.filter((task) => task.status === "in_progress" && !task.parent_id);
  const pending = tasks.filter((task) => task.status === "todo" && !task.parent_id);

  if (inProgress.length === 0 && pending.length === 0) {
    return (
      <EmptyState
        title="Нет активных задач"
        hint="Все задачи либо завершены, либо ещё не созданы."
        action={<Link to={window.location.pathname.replace(/\/active$/, "")}><Button>Все задачи</Button></Link>}
      />
    );
  }

  const row = (task: Task): JSX.Element => (
    <TaskRow
      key={task.id}
      task={task}
      children={childrenOf(task.id)}
      dependencyCount={counts.get(task.id) ?? 0}
      onOpen={onOpen}
      onStatus={onStatus}
      expanded={expanded.has(task.id)}
      onToggle={() => toggleIn(task.id, expanded, onToggle)}
    />
  );

  return (
    <>
      {inProgress.length > 0 && (
        <div className="task-group">
          <div className="task-group__head"><FiClock /> В работе · {inProgress.length}</div>
          <div className="task-list">{inProgress.map(row)}</div>
        </div>
      )}
      {pending.length > 0 && (
        <div className="task-group">
          <div className="task-group__head task-group__head--pending">Ожидают старта · {pending.length}</div>
          <div className="task-list">{pending.map(row)}</div>
        </div>
      )}
    </>
  );
}

function DoneTasksView(props: {
  tasks: Task[];
  childrenOf: (parentId: string) => Task[];
  counts: Map<string, number>;
  onOpen: (id: string) => void;
  expanded: Set<string>;
  onToggle: (updater: (current: Set<string>) => Set<string>) => void;
}): JSX.Element {
  const { tasks, childrenOf, counts, onOpen, expanded, onToggle } = props;
  const done = tasks.filter((task) => (task.status === "done" || task.status === "cancelled") && !task.parent_id);

  if (done.length === 0) {
    return <EmptyState title="Ничего не завершено" hint="Здесь появятся задачи со статусом «Завершена» или «Отменена»." />;
  }

  return (
    <div className="task-list">
      {done.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          children={childrenOf(task.id)}
          dependencyCount={counts.get(task.id) ?? 0}
          onOpen={onOpen}
          onStatus={() => undefined}
          expanded={expanded.has(task.id)}
          onToggle={() => toggleIn(task.id, expanded, onToggle)}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Строка задачи: компактная карточка в списке                         */
/* ------------------------------------------------------------------ */

function TaskRow(props: {
  task: Task;
  children: Task[];
  dependencyCount: number;
  onOpen: (id: string) => void;
  onStatus: (task: Task, status: TaskStatus) => void;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  const { task, children, dependencyCount, onOpen, onStatus, expanded, onToggle } = props;
  const tone = deadlineTone(task);
  const doneChildren = children.filter((child) => child.status === "done").length;

  return (
    <article
      className={`task-row task-row--${task.priority} ${task.status === "done" ? "task-row--done" : ""}`}
      onClick={() => onOpen(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === "Enter") onOpen(task.id); }}
    >
      <span className={`priority-dot priority-dot--${task.priority}`} />
      <div className="task-row__main">
        <div className="task-row__title">
          {children.length > 0 && (
            <button
              className="task-row__caret"
              onClick={(event) => { event.stopPropagation(); onToggle(); }}
              aria-label="Показать подзадачи"
            >
              {expanded ? <FiChevronDown /> : <FiChevronRight />}
            </button>
          )}
          <strong>{task.name}</strong>
          {task.is_critical && <Badge tone="critical">Критическая</Badge>}
          {task.archived && <Badge tone="muted">Архив</Badge>}
        </div>
        <div className="task-row__meta">
          <span className={`due due--${tone}`}>
            {task.status !== "done" && task.status !== "cancelled" && <FiClock />} {formatDueDate(task.due_date)}
          </span>
          <span className="task-row__assignee">
            <FiUser /> {task.assignee ?? "Без исполнителя"}
          </span>
          {dependencyCount > 0 && <span className="task-row__deps"><FiLink /> {dependencyCount}</span>}
          <span>{task.duration_days} дн.</span>
        </div>
        {children.length > 0 && (
          <div className="task-row__progress">
            <i><b style={{ width: `${(doneChildren / children.length) * 100}%` }} /></i>
            <small>{doneChildren}/{children.length} подзадач</small>
          </div>
        )}
      </div>
      <div className="task-row__actions" onClick={(event) => event.stopPropagation()}>
        {task.status !== "done" && task.status !== "cancelled" && (
          <>
            {task.status === "todo" && (
              <button className="task-row__quick" onClick={() => onStatus(task, "in_progress")} title="Начать">
                Начать
              </button>
            )}
            <button className="task-row__quick task-row__quick--done" onClick={() => onStatus(task, "done")} title="Завершить">
              Готово
            </button>
          </>
        )}
        <button className="icon-button" onClick={() => onOpen(task.id)} title="Открыть задачу">
          <FiChevronRight />
        </button>
      </div>
      {expanded && children.length > 0 && (
        <div className="subtask-rows">
          {children.map((child) => (
            <div key={child.id} className="subtask-row" onClick={(event) => { event.stopPropagation(); onOpen(child.id); }}>
              <span className={`priority-dot priority-dot--${child.priority}`} />
              <span className="subtask-row__name">{child.name}</span>
              <span className="subtask-row__meta">{STATUS_LABELS[child.status]} · {child.assignee ?? "без исполнителя"}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function TaskCreateForm(props: {
  eventId: string;
  tasks: Task[];
  people: string[];
  busy: boolean;
  onSubmit: (
    payload: {
      name: string; description: string; duration_days: number; priority: TaskPriority;
      due_date: string | null; assignee: string | null; parent_id: string | null; tags: string[];
    },
    predecessors: string[],
  ) => Promise<Task | null>;
  onCancel: () => void;
  onCreated: (taskId: string) => void;
}): JSX.Element {
  const { tasks, people, busy, onSubmit, onCancel, onCreated } = props;
  const [form, setForm] = useState(() => ({
    name: "",
    description: "",
    duration: "1",
    priority: "medium" as TaskPriority,
    dueDate: "",
    assignee: "",
    parentId: new URLSearchParams(window.location.search).get("parent") ?? "",
    tags: "",
  }));
  const [predecessors, setPredecessors] = useState<string[]>([]);
  const [predecessorQuery, setPredecessorQuery] = useState("");

  const candidates = useMemo(
    () =>
      tasks
        .filter((task) => task.id !== form.parentId)
        .filter((task) => !predecessors.includes(task.id))
        .filter((task) => task.name.toLowerCase().includes(predecessorQuery.toLowerCase())),
    [tasks, predecessors, predecessorQuery, form.parentId],
  );

  const chosenTasks = predecessors
    .map((predecessorId) => tasks.find((task) => task.id === predecessorId))
    .filter((task): task is Task => task !== undefined);

  const togglePredecessor = (taskId: string): void =>
    setPredecessors((current) =>
      current.includes(taskId) ? current.filter((item) => item !== taskId) : [...current, taskId],
    );

  const submit = async (keepOpen: boolean): Promise<void> => {
    if (!form.name.trim()) return;
    const created = await onSubmit(
      {
        name: form.name.trim(),
        description: form.description.trim(),
        duration_days: Math.max(1, Number(form.duration) || 1),
        priority: form.priority,
        due_date: form.dueDate || null,
        assignee: form.assignee || null,
        parent_id: form.parentId || null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      },
      predecessors,
    );
    if (created === null) return;
    if (keepOpen) {
      setForm((current) => ({ ...current, name: "", description: "", tags: "" }));
      setPredecessors([]);
    } else {
      onCreated(created.id);
    }
  };

  return (
    <div className="task-create">
      <div className="task-create__head">
        <button className="task-create__back" onClick={onCancel}>
          <FiArrowLeft /> К списку задач
        </button>
        <div>
          <div className="eyebrow">Новая задача мероприятия</div>
          <h2 className="page__title">Создание задачи</h2>
        </div>
      </div>
      <div className="task-create__grid">
        <div className="card task-create__main">
          <label className="field">
            <span className="field__label">Название *</span>
            <input
              className="field__input"
              autoFocus
              placeholder="Например: Согласовать макет сцены"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="field">
            <span className="field__label">Описание</span>
            <textarea
              className="field__input"
              rows={4}
              placeholder="Что нужно сделать, критерии готовности, контакты…"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <div className="task-create__fields">
            <label className="field">
              <span className="field__label">Длительность, дней</span>
              <input className="field__input" type="number" min={1} value={form.duration}
                onChange={(event) => setForm((current) => ({ ...current, duration: event.target.value }))} />
            </label>
            <label className="field">
              <span className="field__label">Приоритет</span>
              <select className="field__input" value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as TaskPriority }))}>
                {PRIORITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Срок выполнения</span>
              <input className="field__input" type="date" value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
            </label>
            <label className="field">
              <span className="field__label">Исполнитель</span>
              <select className="field__input" value={form.assignee}
                onChange={(event) => setForm((current) => ({ ...current, assignee: event.target.value }))}>
                <option value="">Не назначен</option>
                {people.map((person) => <option key={person} value={person}>{person}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Родительская задача</span>
              <select className="field__input" value={form.parentId}
                onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}>
                <option value="">— корневая задача —</option>
                {tasks.filter((task) => task.id !== form.parentId).map((task) => (
                  <option key={task.id} value={task.id}>{task.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Метки (через запятую)</span>
              <input className="field__input" placeholder="сцена, подрядчик" value={form.tags}
                onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} />
            </label>
          </div>
          <div className="task-create__submit">
            <Button variant="ghost" onClick={onCancel}>Отмена</Button>
            <Button variant="ghost" disabled={busy || !form.name.trim()} onClick={() => void submit(true)}>
              {busy ? <Spinner /> : "Создать и ещё одну"}
            </Button>
            <Button disabled={busy || !form.name.trim()} onClick={() => void submit(false)}>
              {busy ? <Spinner /> : "Создать задачу"}
            </Button>
          </div>
        </div>

        <div className="card task-create__deps">
          <div className="task-create__deps-head">
            <strong><FiLink /> Зависит от</strong>
            <span>Задачи, которые должны завершиться до этой</span>
          </div>
          {chosenTasks.length > 0 && (
            <div className="deps-chips">
              {chosenTasks.map((task) => (
                <span key={task.id} className="deps-chip">
                  {task.name}
                  <button onClick={() => togglePredecessor(task.id)} aria-label="Убрать связь">×</button>
                </span>
              ))}
            </div>
          )}
          <input
            className="field__input"
            placeholder="Поиск задачи для связи…"
            value={predecessorQuery}
            onChange={(event) => setPredecessorQuery(event.target.value)}
          />
          <div className="deps-candidates">
            {candidates.length === 0 ? (
              <small>{tasks.length === 0 ? "Пока нет других задач" : "Ничего не найдено"}</small>
            ) : (
              candidates.slice(0, 8).map((task) => (
                <button key={task.id} className="deps-candidate" onClick={() => togglePredecessor(task.id)}>
                  <span className={`priority-dot priority-dot--${task.priority}`} />
                  <span className="deps-candidate__name">{task.name}</span>
                  <FiPlus />
                </button>
              ))
            )}
          </div>
          <p className="task-create__hint">
            Связи также можно проводить мышью в графе зависимостей: перетащите от правого порта задачи-предшественника к левому порту последователя.
          </p>
        </div>
      </div>
    </div>
  );
}

function TaskDrawer(props: {
  task: Task;
  subtasks: Task[];
  people: string[];
  busy: boolean;
  onClose: () => void;
  onUpdate: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddSubtask: () => void;
}): JSX.Element {
  const { task, subtasks, people, busy, onClose, onUpdate, onDelete, onDuplicate, onAddSubtask } = props;
  const { push } = useToast();
  const [comments, setComments] = useState<import("../types").TaskComment[]>([]);
  const [comment, setComment] = useState("");
  const [tag, setTag] = useState("");
  const [predecessors, setPredecessors] = useState<TaskDependency[]>([]);
  const [successorCount, setSuccessorCount] = useState(0);
  const [linkSource, setLinkSource] = useState("");
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadDrawerData = async (): Promise<void> => {
      const [nextComments, incoming, all] = await Promise.all([
        api.tasks.comments(task.id).catch(() => []),
        api.dependencies.list(task.id).catch(() => [] as TaskDependency[]),
        api.tasks.listAll(task.event_id).catch(() => [] as Task[]),
      ]);
      if (cancelled) return;
      setComments(nextComments);
      setPredecessors(incoming);
      setAllTasks(all);
      const outgoingLists = await Promise.all(
        all
          .filter((candidate) => candidate.id !== task.id)
          .map((candidate) => api.dependencies.list(candidate.id).catch(() => [] as TaskDependency[])),
      );
      if (cancelled) return;
      setSuccessorCount(outgoingLists.flat().filter((dep) => dep.predecessor_id === task.id).length);
    };
    void loadDrawerData();
    return () => { cancelled = true; };
  }, [task.id]);

  const addComment = async (): Promise<void> => {
    if (!comment.trim()) return;
    try {
      const created = await api.tasks.addComment(task.id, comment.trim());
      setComments((current) => [created, ...current]);
      setComment("");
    } catch (error: unknown) {
      push({ tone: "error", title: "Не удалось добавить комментарий", message: describeError(error) });
    }
  };

  const addTag = (): void => {
    const value = tag.trim();
    if (!value || task.tags.includes(value)) return;
    onUpdate({ tags: [...task.tags, value] });
    setTag("");
  };

  /** Добавление предшественника из drawer (FS, лаг 0). */
  const addPredecessor = async (): Promise<void> => {
    if (!linkSource) return;
    try {
      await api.dependencies.create(task.id, { predecessor_id: linkSource, dependency_type: "FS", lag_days: 0 });
      await api.schedule.calculate(task.event_id).catch(() => undefined);
      setPredecessors(await api.dependencies.list(task.id));
      setLinkSource("");
      push({ tone: "ok", title: "Связь добавлена" });
    } catch (error: unknown) {
      push({ tone: "error", title: "Не удалось добавить связь", message: describeError(error) });
    }
  };

  const removePredecessor = async (predecessorId: string): Promise<void> => {
    try {
      await api.dependencies.remove(task.id, predecessorId);
      await api.schedule.calculate(task.event_id).catch(() => undefined);
      setPredecessors(await api.dependencies.list(task.id));
      push({ tone: "ok", title: "Связь удалена" });
    } catch (error: unknown) {
      push({ tone: "error", title: "Не удалось удалить связь", message: describeError(error) });
    }
  };

  const predecessorTasks = predecessors
    .map((dep) => allTasks.find((item) => item.id === dep.predecessor_id))
    .filter((item): item is Task => item !== undefined);

  return (
    <aside className="task-drawer">
      <div className="task-drawer__head">
        <span>Задача / детали</span>
        <button className="icon-button" onClick={onClose}>×</button>
      </div>
      <div className="task-drawer__body">
        <div className="eyebrow">{task.is_critical ? "Критический путь" : "Операционная задача"}</div>
        <h2>{task.name}</h2>
        <label className="field">
          <span className="field__label">Статус</span>
          <select value={task.status} onChange={(event) => onUpdate({ status: event.target.value as TaskStatus })}>
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Исполнитель</span>
          <select value={task.assignee ?? ""} onChange={(event) => onUpdate({ assignee: event.target.value || null })}>
            <option value="">Не назначен</option>
            {people.map((person) => <option key={person} value={person}>{person}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Срок выполнения</span>
          <input className="field__input" type="date" value={task.due_date?.slice(0, 10) ?? ""}
            onChange={(event) => onUpdate({ due_date: event.target.value || null })} />
        </label>
        <div className="tag-editor">
          <div className="tag-list">
            {task.tags.map((item) => (
              <span key={item}>
                {item}
                <button onClick={() => onUpdate({ tags: task.tags.filter((current) => current !== item) })}>×</button>
              </span>
            ))}
          </div>
          <div className="tag-input">
            <input value={tag} onChange={(event) => setTag(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") addTag(); }} placeholder="Добавить метку" />
            <button onClick={addTag}><FiPlus /></button>
          </div>
        </div>
        <div className="drawer-stats">
          <div><span>Длительность</span><strong>{task.duration_days} дн.</strong></div>
          <div><span>Резерв</span><strong>{task.total_float ?? "—"} дн.</strong></div>
        </div>
        <div className="drawer-section">
          <div className="drawer-section__head"><strong><FiLink /> Зависимости</strong></div>
          <div className="drawer-links">
            {predecessorTasks.length === 0 && successorCount === 0 && (
              <small>Связей нет. Добавьте предшественника ниже или проведите стрелку в графе.</small>
            )}
            {predecessorTasks.map((item) => (
              <div key={item.id} className="drawer-link">
                <span className="drawer-link__name">{item.name}</span>
                <span className="drawer-link__type">← до старта</span>
                <button onClick={() => void removePredecessor(item.id)} title="Убрать связь"><FiTrash2 /></button>
              </div>
            ))}
            {successorCount > 0 && (
              <small>Исходящих связей: {successorCount} — эта задача блокирует следующие.</small>
            )}
          </div>
          <div className="drawer-link-add">
            <select value={linkSource} onChange={(event) => setLinkSource(event.target.value)}>
              <option value="">Добавить предшественник…</option>
              {allTasks
                .filter((item) => item.id !== task.id && !predecessors.some((dep) => dep.predecessor_id === item.id))
                .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button onClick={() => void addPredecessor()} disabled={!linkSource}>Связать</button>
          </div>
        </div>
        <div className="drawer-section">
          <div className="drawer-section__head">
            <strong>Подзадачи</strong>
            <button onClick={onAddSubtask}><FiPlus /> Добавить</button>
          </div>
          {subtasks.length === 0 ? (
            <small>Пока нет подзадач</small>
          ) : (
            subtasks.map((item) => (
              <div key={item.id} className="drawer-subtask">
                <span>{item.name}</span>
                <Badge tone={item.status === "done" ? "ok" : "muted"}>{STATUS_LABELS[item.status]}</Badge>
              </div>
            ))
          )}
        </div>
        <div className="drawer-section">
          <div className="drawer-section__head"><strong>Комментарии</strong></div>
          <div className="drawer-comment-add">
            <input value={comment} onChange={(event) => setComment(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void addComment(); }} placeholder="Комментарий…" />
            <button onClick={() => void addComment()}>Отправить</button>
          </div>
          {comments.slice(0, 5).map((item) => (
            <div key={item.id} className="drawer-comment">
              <strong>{item.author}</strong>
              <span>{item.body}</span>
            </div>
          ))}
        </div>
        <div className="drawer-actions">
          <Button variant="ghost" onClick={onDuplicate} disabled={busy}><FiCopy /> Копия</Button>
          <Button variant="ghost" onClick={() => onUpdate({ archived: !task.archived })}>
            <FiArchive /> {task.archived ? "Вернуть" : "В архив"}
          </Button>
          <Button variant="danger" onClick={onDelete} disabled={busy}><FiTrash2 /> Удалить</Button>
        </div>
      </div>
    </aside>
  );
}