import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiPlus } from "react-icons/fi";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api } from "../services/api";
import { describeError } from "../services/errors";
import type { Task, TaskDependency } from "../types";
import { Badge, Button, EmptyState, Skeleton, Spinner, useToast } from "../components/ui";

interface TaskNodeData extends Record<string, unknown> {
  task: Task;
  selected: boolean;
  onSelect: (taskId: string) => void;
}

type TaskFlowNode = Node<TaskNodeData, "task">;

const STATUS_LABELS: Record<Task["status"], string> = {
  todo: "Не начата",
  in_progress: "В работе",
  done: "Завершена",
  cancelled: "Отменена",
};

/** Цвета статусов — в палитре Editorial (чернила, вермильон, олива, янтарь). */
const STATUS_COLORS: Record<Task["status"], string> = {
  todo: "#b0a594",
  in_progress: "#a26e17",
  done: "#4d6a3b",
  cancelled: "#a32817",
};

const EDGE_NEUTRAL = "#c6b9a2";
const EDGE_CRITICAL = "#a32817";
const CANVAS_GRID = "#e8e0d1";
const CANVAS_MASK = "rgba(244, 239, 230, 0.72)";

function formatDay(value: number | null): string {
  return value === null ? "—" : `день ${value}`;
}

function formatDueDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(value))
    : "Без дедлайна";
}

function getLayers(tasks: Task[], dependencies: TaskDependency[]): Map<string, number> {
  const predecessors = new Map<string, string[]>();
  const taskIds = new Set(tasks.map((task) => task.id));
  for (const dependency of dependencies) {
    if (!taskIds.has(dependency.predecessor_id) || !taskIds.has(dependency.successor_id)) continue;
    const values = predecessors.get(dependency.successor_id) ?? [];
    values.push(dependency.predecessor_id);
    predecessors.set(dependency.successor_id, values);
  }
  const cache = new Map<string, number>();
  const visiting = new Set<string>();
  const layerOf = (taskId: string): number => {
    const cached = cache.get(taskId);
    if (cached !== undefined) return cached;
    if (visiting.has(taskId)) return 0;
    visiting.add(taskId);
    const layer = Math.max(0, ...(predecessors.get(taskId) ?? []).map((id) => layerOf(id) + 1));
    visiting.delete(taskId);
    cache.set(taskId, layer);
    return layer;
  };
  tasks.forEach((task) => layerOf(task.id));
  return cache;
}

function TaskNode({ data }: NodeProps<TaskFlowNode>): JSX.Element {
  const { task, selected, onSelect } = data;
  const critical = task.is_critical;
  const statusColor = STATUS_COLORS[task.status];
  return (
    <div
      className={`flow-task-node ${critical ? "flow-task-node--critical" : ""} ${selected ? "flow-task-node--selected" : ""}`}
      data-status={task.status}
      onClick={() => onSelect(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(task.id);
      }}
    >
      <div className="flow-task-node__status" style={{ background: statusColor }} />
      <Handle type="target" position={Position.Left} className="flow-task-node__handle" />
      <div className="flow-task-node__header">
        <span className="flow-task-node__status-label">{STATUS_LABELS[task.status]}</span>
        {critical && <span className="flow-task-node__critical">Критическая</span>}
      </div>
      <strong className="flow-task-node__title">{task.name}</strong>
      <div className="flow-task-node__meta">
        <span>{task.duration_days} дн.</span>
        <span>{task.assignee ?? "Без исполнителя"}</span>
      </div>
      <div className="flow-task-node__schedule">
        <span>{formatDueDate(task.due_date)}</span>
        <span>
          {task.earliest_start === null
            ? "План не рассчитан"
            : `${formatDay(task.earliest_start)} → ${formatDay(task.earliest_finish)}`}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="flow-task-node__handle" />
    </div>
  );
}

const nodeTypes = { task: TaskNode };

export default function EventGraphPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { push } = useToast();
  const pushRef = useRef(push);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deps, setDeps] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [nodes, setNodes] = useState<TaskFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  /** Идентификатор выбранного ребра — открывает управление связью. */
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [depBusy, setDepBusy] = useState(false);

  useEffect(() => {
    pushRef.current = push;
  }, [push]);

  const load = useCallback(async (): Promise<void> => {
    if (!id) {
      setLoadError("Не указан идентификатор события.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const taskData = await api.tasks.listAll(id);
      const dependencyLists = await Promise.all(
        taskData.map((task) => api.dependencies.list(task.id).catch(() => [])),
      );
      setTasks(taskData);
      setDeps(dependencyLists.flat());
    } catch (error: unknown) {
      const message = describeError(error);
      setLoadError(message);
      pushRef.current({ tone: "error", title: "Ошибка загрузки графа", message });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const graphModel = useMemo(() => {
    if (tasks.length === 0) return { nodes: [] as TaskFlowNode[], edges: [] as Edge[] };
    const layers = getLayers(tasks, deps);
    const byLayer = new Map<number, Task[]>();
    tasks.forEach((task) => {
      const layer = layers.get(task.id) ?? 0;
      byLayer.set(layer, [...(byLayer.get(layer) ?? []), task]);
    });
    const taskNodes: TaskFlowNode[] = [];
    [...byLayer.entries()]
      .sort(([left], [right]) => left - right)
      .forEach(([layer, layerTasks]) => {
        layerTasks
          .sort((left, right) => left.name.localeCompare(right.name))
          .forEach((task, index) => {
            taskNodes.push({
              id: task.id,
              type: "task",
              position: { x: layer * 360, y: index * 170 },
              data: { task, selected: task.id === selectedId, onSelect: setSelectedId },
            });
          });
      });
    const taskIds = new Set(tasks.map((task) => task.id));
    const taskEdges: Edge[] = deps
      .filter(
        (dependency) =>
          taskIds.has(dependency.predecessor_id) && taskIds.has(dependency.successor_id),
      )
      .map((dependency) => {
        const critical =
          tasks.find((task) => task.id === dependency.predecessor_id)?.is_critical &&
          tasks.find((task) => task.id === dependency.successor_id)?.is_critical;
        const stroke = critical ? EDGE_CRITICAL : EDGE_NEUTRAL;
        return {
          id: `${dependency.predecessor_id}::${dependency.successor_id}`,
          source: dependency.predecessor_id,
          target: dependency.successor_id,
          type: "smoothstep",
          label:
            dependency.dependency_type === "FS" && dependency.lag_days === 0
              ? undefined
              : `${dependency.dependency_type} +${dependency.lag_days}`,
          labelStyle: { fill: "#877c6d", fontSize: 11, fontWeight: 600 },
          labelBgStyle: { fill: "#faf5ec", fillOpacity: 0.95 },
          style: { stroke, strokeWidth: critical ? 2.5 : 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        };
      });
    return { nodes: taskNodes, edges: taskEdges };
  }, [deps, selectedId, tasks]);

  useEffect(() => {
    setNodes(graphModel.nodes);
    setEdges(graphModel.edges);
  }, [graphModel]);

  const selected = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [selectedId, tasks],
  );

  const recalculate = async (): Promise<void> => {
    if (!id) return;
    setCalcBusy(true);
    try {
      const result = await api.schedule.calculate(id);
      pushRef.current({
        tone: "ok",
        title: "План обновлён",
        message: `Горизонт: ${result.project_duration} дн., критических: ${result.critical_path.length}`,
      });
      await load();
    } catch (error: unknown) {
      pushRef.current({
        tone: "error",
        title: "Не удалось обновить план",
        message: describeError(error),
      });
    } finally {
      setCalcBusy(false);
    }
  };

  const tasksHref = id ? `/events/${id}/tasks` : "/events";

  /** Создание связи перетаскиванием: source — предшественник, target — последователь. */
  const handleConnect = useCallback(
    async (connection: { source: string | null; target: string | null }): Promise<void> => {
      if (!connection.source || !connection.target || connection.source === connection.target) return;
      setDepBusy(true);
      try {
        await api.dependencies.create(connection.target, {
          predecessor_id: connection.source,
          dependency_type: "FS",
          lag_days: 0,
        });
        await api.schedule.calculate(id ?? "");
        await load();
        pushRef.current({ tone: "ok", title: "Связь создана", message: "Задача-последователь теперь ждёт завершения предшественника." });
      } catch (error: unknown) {
        pushRef.current({ tone: "error", title: "Не удалось создать связь", message: describeError(error) });
      } finally {
        setDepBusy(false);
      }
    },
    [id, load],
  );

  /** Удаление связи: successor_id — ключ пути запроса, predecessor_id — в URL. */
  const removeDependency = useCallback(
    async (predecessorId: string, successorId: string): Promise<void> => {
      setDepBusy(true);
      try {
        await api.dependencies.remove(successorId, predecessorId);
        await api.schedule.calculate(id ?? "");
        setSelectedEdgeId(null);
        await load();
        pushRef.current({ tone: "ok", title: "Связь удалена" });
      } catch (error: unknown) {
        pushRef.current({ tone: "error", title: "Не удалось удалить связь", message: describeError(error) });
      } finally {
        setDepBusy(false);
      }
    },
    [id, load],
  );

  /** Связи выбранной задачи: входящие (predecessor) и исходящие (successor). */
  const selectedDeps = useMemo(() => {
    if (!selectedId) return { incoming: [], outgoing: [] };
    return {
      incoming: deps.filter((dep) => dep.successor_id === selectedId),
      outgoing: deps.filter((dep) => dep.predecessor_id === selectedId),
    };
  }, [deps, selectedId]);

  /** Связь, выбранная кликом по ребру. */
  const selectedEdgeDep = useMemo(
    () => (selectedEdgeId ? deps.find((dep) => `${dep.predecessor_id}::${dep.successor_id}` === selectedEdgeId) ?? null : null),
    [deps, selectedEdgeId],
  );

  return (
    <section className="page graph-workspace">
      <div className="page__header">
        <div>
          <div className="eyebrow">Главный план события</div>
          <h2 className="page__title">План задач</h2>
          <p className="graph-subtitle">
            Зависимости задаются перетаскиванием стрелок: от правого порта задачи-предшественника к левому порту последователя. Клик по стрелке — удалить или посмотреть связь.
          </p>
        </div>
        <div className="toolbar">
          <Link to={id ? `/events/${id}/tasks/new` : "/events"}>
            <Button>
              <FiPlus /> Новая задача
            </Button>
          </Link>
          <Link to={tasksHref}>
            <Button variant="ghost">Задачи</Button>
          </Link>
          <Button variant="ghost" onClick={() => void recalculate()} disabled={calcBusy}>
            {calcBusy ? (
              <>
                <Spinner /> Обновление…
              </>
            ) : (
              "Обновить план"
            )}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="card graph-loading">
          <Skeleton w="40%" h={20} />
          <Skeleton w="100%" h={420} />
        </div>
      )}

      {!loading && loadError !== null && (
        <EmptyState
          title="Не удалось загрузить граф"
          hint={loadError}
          action={<Button onClick={() => void load()}>Повторить</Button>}
        />
      )}

      {!loading && loadError === null && tasks.length === 0 && (
        <EmptyState
          title="Граф пуст"
          hint="Добавьте задачи, чтобы увидеть связи между ними."
          action={<Button onClick={() => navigate(tasksHref)}>К задачам</Button>}
        />
      )}

      {!loading && loadError === null && tasks.length > 0 && (
        <>
          <div className="graph-overview">
            <div className="graph-overview__intro">
              <span className="graph-overview__eyebrow">Интерактивная сеть</span>
              <strong>План в контексте зависимостей</strong>
              <span>Выберите узел справа, чтобы увидеть CPM-метрики.</span>
            </div>
            <div className="graph-overview__metric">
              <span>Задачи</span>
              <strong>{tasks.length}</strong>
            </div>
            <div className="graph-overview__metric graph-overview__metric--critical">
              <span>Критические</span>
              <strong>{tasks.filter((task) => task.is_critical).length}</strong>
            </div>
            <div className="graph-overview__metric">
              <span>Связи</span>
              <strong>{edges.length}</strong>
            </div>
          </div>

          <div className="graph-container graph-container--flow">
            <div className="graph-flow-panel">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => {
                  setSelectedId(node.id);
                  setSelectedEdgeId(null);
                }}
                onEdgeClick={(_, edge) => {
                  setSelectedEdgeId(edge.id);
                  setSelectedId(null);
                }}
                onPaneClick={() => {
                  setSelectedId(null);
                  setSelectedEdgeId(null);
                }}
                onConnect={(connection) => void handleConnect(connection)}
                fitView
                fitViewOptions={{ padding: 0.2, minZoom: 0.35, maxZoom: 1.35 }}
                minZoom={0.2}
                maxZoom={2}
                elevateEdgesOnSelect
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={24} size={1} color={CANVAS_GRID} />
                <Controls position="bottom-left" showInteractive={false} />
                <MiniMap
                  nodeColor={(node) => STATUS_COLORS[(node.data as TaskNodeData).task.status]}
                  maskColor={CANVAS_MASK}
                />
              </ReactFlow>
            </div>

            <div className="graph-detail-panel">
              {selectedEdgeDep ? (
                <div className="fade-in">
                  <div className="graph-detail-panel__heading">
                    <div>
                      <span className="eyebrow">Связь задач</span>
                      <h3>
                        {tasks.find((task) => task.id === selectedEdgeDep.predecessor_id)?.name ?? "…"} →{" "}
                        {tasks.find((task) => task.id === selectedEdgeDep.successor_id)?.name ?? "…"}
                      </h3>
                    </div>
                    <Badge tone="muted">
                      {selectedEdgeDep.dependency_type} +{selectedEdgeDep.lag_days} дн.
                    </Badge>
                  </div>
                  <p className="graph-dep-note">
                    Последователь не начнётся, пока предшественник не завершится (FS). Удалите связь, если порядок не нужен.
                  </p>
                  <div className="detail-actions">
                    <Button variant="ghost" onClick={() => setSelectedEdgeId(null)}>
                      Закрыть
                    </Button>
                    <Button
                      variant="danger"
                      disabled={depBusy}
                      onClick={() => void removeDependency(selectedEdgeDep.predecessor_id, selectedEdgeDep.successor_id)}
                    >
                      {depBusy ? <Spinner /> : "Удалить связь"}
                    </Button>
                  </div>
                </div>
              ) : selected ? (
                <div className="fade-in">
                  <div className="graph-detail-panel__heading">
                    <div>
                      <span className="eyebrow">Выбранная задача</span>
                      <h3>{selected.name}</h3>
                    </div>
                    {selected.is_critical ? (
                      <Badge tone="critical">Критическая</Badge>
                    ) : (
                      <Badge tone={selected.status === "done" ? "ok" : "muted"}>
                        {STATUS_LABELS[selected.status]}
                      </Badge>
                    )}
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Статус</span>
                    <span className="detail-value">{STATUS_LABELS[selected.status]}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Исполнитель</span>
                    <span className="detail-value">{selected.assignee ?? "Не назначен"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Длительность</span>
                    <span className="detail-value">{selected.duration_days} дн.</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Раннее начало</span>
                    <span className="detail-value">{formatDay(selected.earliest_start)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Раннее окончание</span>
                    <span className="detail-value">{formatDay(selected.earliest_finish)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Полный резерв</span>
                    <span className="detail-value">{selected.total_float ?? "—"} дн.</span>
                  </div>
                  <div className="graph-deps-block">
                    <div className="graph-deps-block__head">
                      <strong>Зависимости</strong>
                      <span>{selectedDeps.incoming.length} входящих · {selectedDeps.outgoing.length} исходящих</span>
                    </div>
                    <div className="graph-deps-list">
                      {selectedDeps.incoming.length === 0 && selectedDeps.outgoing.length === 0 && (
                        <small>Связей нет. Тяните стрелку от правого порта задачи к левому порту другой.</small>
                      )}
                      {selectedDeps.incoming.map((dep) => {
                        const predecessor = tasks.find((task) => task.id === dep.predecessor_id);
                        return (
                          <div key={`in-${dep.predecessor_id}`} className="graph-dep-row">
                            <span>← {predecessor?.name ?? "—"}</span>
                            <button
                              disabled={depBusy}
                              onClick={() => void removeDependency(dep.predecessor_id, dep.successor_id)}
                              title="Удалить связь"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                      {selectedDeps.outgoing.map((dep) => {
                        const successor = tasks.find((task) => task.id === dep.successor_id);
                        return (
                          <div key={`out-${dep.successor_id}`} className="graph-dep-row graph-dep-row--out">
                            <span>→ {successor?.name ?? "—"}</span>
                            <button
                              disabled={depBusy}
                              onClick={() => void removeDependency(dep.predecessor_id, dep.successor_id)}
                              title="Удалить связь"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="detail-actions">
                    <Button variant="ghost" onClick={() => navigate(tasksHref)}>
                      К задачам
                    </Button>
                    <Button onClick={() => void recalculate()} disabled={calcBusy}>
                      {calcBusy ? <Spinner /> : "Пересчитать"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="graph-empty-state">
                  <div className="graph-empty-mark">+</div>
                  <strong>Выберите задачу или связь</strong>
                  <span>
                    Клик по узлу — детали и CPM-метрики, клик по стрелке — управление связью. Чтобы задать зависимость, тяните от правого порта задачи к левому порту другой.
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
