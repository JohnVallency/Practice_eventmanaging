import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../services/api";
import { describeError } from "../services/errors";
import type { Task, TaskDependency } from "../types";
import { Badge, Button, EmptyState, Skeleton, Spinner, useToast } from "../components/ui";

/* --------------------------- Геометрия графа ------------------------------ */

const NODE_W = 240;
const NODE_H = 120;
const GAP_X = 80;
const GAP_Y = 32;
const PADDING = 32;

interface GraphNode {
  task: Task;
  layer: number;
  x: number;
  y: number;
}

interface GraphEdge {
  key: string;
  from: GraphNode;
  to: GraphNode;
  type: string;
  lag: number;
  critical: boolean;
}

interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

function formatDay(value: number | null): string {
  return value === null ? "—" : `день ${value}`;
}

export default function EventGraphPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { push } = useToast();
  const pushRef = useRef(push);
  useEffect(() => {
    pushRef.current = push;
  }, [push]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [deps, setDeps] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [zoom, setZoom] = useState(1);

  const tasksToGraph = useCallback((): Promise<{ tasks: Task[]; deps: TaskDependency[] }> => {
    if (!id) {
      return Promise.reject(new Error("Не указан идентификатор события."));
    }
    return api.tasks.list(id).then((data) =>
      Promise.all(data.map((task) => api.dependencies.list(task.id).catch(() => []))).then(
        (lists) => ({ tasks: data, deps: lists.flat() }),
      ),
    );
  }, [id]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await tasksToGraph();
      setTasks(data.tasks);
      setDeps(data.deps);
    } catch (error: unknown) {
      const message = describeError(error);
      setLoadError(message);
      pushRef.current({ tone: "error", title: "Ошибка загрузки графа", message });
    } finally {
      setLoading(false);
    }
  }, [tasksToGraph]);

  useEffect(() => {
    void load();
  }, [load]);

  const layout = useMemo<GraphLayout | null>(() => {
    if (loading || tasks.length === 0) {
      return null;
    }
    const taskById = new Map(tasks.map((task) => [task.id, task] as const));

    const predecessors = new Map<string, string[]>();
    const successors = new Map<string, string[]>();
    const seen = new Set<string>();
    for (const dep of deps) {
      if (!taskById.has(dep.predecessor_id) || !taskById.has(dep.successor_id)) {
        continue;
      }
      const key = `${dep.predecessor_id}->${dep.successor_id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const preds = predecessors.get(dep.successor_id) ?? [];
      preds.push(dep.predecessor_id);
      predecessors.set(dep.successor_id, preds);
      const succs = successors.get(dep.predecessor_id) ?? [];
      succs.push(dep.successor_id);
      successors.set(dep.predecessor_id, succs);
    }

    const layerCache = new Map<string, number>();
    const layerOf = (taskId: string): number => {
      const cached = layerCache.get(taskId);
      if (cached !== undefined) {
        return cached;
      }
      layerCache.set(taskId, 0);
      const preds = predecessors.get(taskId) ?? [];
      let layer = 0;
      for (const predId of preds) {
        layer = Math.max(layer, layerOf(predId) + 1);
      }
      layerCache.set(taskId, layer);
      return layer;
    };
    for (const task of tasks) {
      layerOf(task.id);
    }

    const byLayer = new Map<number, Task[]>();
    for (const task of tasks) {
      const layer = layerCache.get(task.id) ?? 0;
      const bucket = byLayer.get(layer) ?? [];
      bucket.push(task);
      byLayer.set(layer, bucket);
    }
    const layerCount = Math.max(1, byLayer.size);

    const nodes: GraphNode[] = [];
    for (const [layer, bucket] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
      bucket.sort((a, b) => a.name.localeCompare(b.name));
      bucket.forEach((task, index) => {
        nodes.push({
          task,
          layer,
          x: PADDING + layer * (NODE_W + GAP_X),
          y: PADDING + index * (NODE_H + GAP_Y),
        });
      });
    }
    const nodeById = new Map(nodes.map((node) => [node.task.id, node] as const));

    const edges: GraphEdge[] = [];
    for (const dep of deps) {
      const from = nodeById.get(dep.predecessor_id);
      const to = nodeById.get(dep.successor_id);
      if (from === undefined || to === undefined) {
        continue;
      }
      edges.push({
        key: `${dep.predecessor_id}->${dep.successor_id}:${dep.dependency_type}:${dep.lag_days}`,
        from,
        to,
        type: dep.dependency_type,
        lag: dep.lag_days,
        critical: from.task.is_critical && to.task.is_critical,
      });
    }

    const width = Math.max(PADDING * 2 + layerCount * NODE_W + (layerCount - 1) * GAP_X, 600);
    const height = Math.max(layerCount * (NODE_H + GAP_Y), 200) + PADDING * 2;

    return { nodes, edges, width, height };
  }, [deps, loading, tasks]);

  const selected = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [selectedId, tasks],
  );

  const recalculate = async (): Promise<void> => {
    if (!id) return;
    setCalcBusy(true);
    try {
      const data = await api.schedule.calculate(id);
      pushRef.current({
        tone: "ok",
        title: "План обновлён",
        message: `Горизонт: ${data.project_duration} дн., критических: ${data.critical_path.length}`,
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

  const tasksHref = id === undefined ? "/events" : `/events/${id}/tasks`;

  return (
    <section className="page">
      <div className="page__header">
        <h2 className="page__title">Граф задач</h2>
        <div className="toolbar">
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

      {tasks.length > 0 && deps.length === 0 && (
        <div className="hint-panel" style={{ marginBottom: 16 }}>
          Все задачи пока независимы: план посчитает их параллельными. Свяжите их, чтобы получить
          цепочки. Кнопка «Зависимости» — на странице «Задачи».
        </div>
      )}

      {loading && (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <Skeleton w="40%" h={20} />
          <Skeleton w="100%" h={220} />
        </div>
      )}

      {!loading && loadError !== null && (
        <EmptyState
          title="Не удалось загрузить граф"
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
          title="Граф пуст"
          hint="Добавьте задачи, чтобы увидеть связи между ними."
          action={
            <Button variant="primary" onClick={() => navigate(tasksHref)}>
              К задачам
            </Button>
          }
        />
      )}

      {layout !== null && (
        <>
          {/* Легенда */}
          <div className="graph-legend" aria-hidden="true">
            <span className="graph-legend__item">
              <span className="graph-legend__line" /> связь: после окончания →
            </span>
            <span className="graph-legend__item">
              <span className="graph-legend__line graph-legend__line--critical" /> критическая цепочка
            </span>
            <span className="graph-legend__item">
              <span className="graph-legend__node" /> есть запас
            </span>
            <span className="graph-legend__item">
              <span className="graph-legend__node graph-legend__node--critical" /> без запаса —
              задержка двигает проект
            </span>
          </div>

          <div className="graph-container">
            {/* Левая часть: SVG-граф */}
            <div className="graph-canvas">
              <div className="graph-controls">
                <Button onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>−</Button>
                <span className="graph-controls__zoom">{Math.round(zoom * 100)}%</span>
                <Button onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>+</Button>
                <Button onClick={() => setZoom(1)}>Сброс</Button>
              </div>
              <div className="graph-svg-wrapper" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                <svg
                  role="img"
                  aria-label="Граф зависимостей задач"
                  width={layout.width}
                  height={layout.height}
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  style={{ display: 'block' }}
                >
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="10"
                      refX="8"
                      refY="3"
                      orient="auto"
                    >
                      <polygon points="0 0, 8 3, 0 6" fill="#D1D5DB" />
                    </marker>
                    <marker
                      id="arrowhead-critical"
                      markerWidth="10"
                      markerHeight="10"
                      refX="8"
                      refY="3"
                      orient="auto"
                    >
                      <polygon points="0 0, 8 3, 0 6" fill="#DC2626" />
                    </marker>
                  </defs>

                  {/* Рёбра */}
                  {layout.edges.map((edge) => {
                    const x1 = edge.from.x + NODE_W;
                    const y1 = edge.from.y + NODE_H / 2;
                    const x2 = edge.to.x;
                    const y2 = edge.to.y + NODE_H / 2;
                    const showLabel = edge.type !== "FS" || edge.lag !== 0;
                    return (
                      <g key={edge.key}>
                        <path
                          d={`M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke={edge.critical ? "#DC2626" : "#D1D5DB"}
                          strokeWidth={edge.critical ? 2.5 : 1.5}
                          markerEnd={edge.critical ? "url(#arrowhead-critical)" : "url(#arrowhead)"}
                        />
                        {showLabel && (
                          <g>
                            <rect
                              x={(x1 + x2) / 2 - 24}
                              y={(y1 + y2) / 2 - 18}
                              width="48"
                              height="14"
                              rx="4"
                              fill="#FFFFFF"
                              stroke="#E7E5E0"
                            />
                            <text
                              x={(x1 + x2) / 2}
                              y={(y1 + y2) / 2 - 8}
                              textAnchor="middle"
                              fontSize={10}
                              fill="#6B7280"
                              fontWeight={500}
                            >
                              {edge.type === "FS" ? `+${edge.lag} дн.` : `${edge.type} +${edge.lag}`}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Узлы-карточки */}
                  {layout.nodes.map((node) => {
                    const critical = node.task.is_critical;
                    const isSelected = node.task.id === selectedId;
                    const hasFloat = node.task.total_float !== null && node.task.total_float > 0;
                    return (
                      <g
                        key={node.task.id}
                        className={isSelected ? "graph-node graph-node--selected" : "graph-node"}
                        onClick={() => setSelectedId(node.task.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <title>{`${node.task.name} — ${node.task.duration_days} дн. Кликните для деталей`}</title>
                        {/* Карточка */}
                        <rect
                          x={node.x}
                          y={node.y}
                          width={NODE_W}
                          height={NODE_H}
                          rx={12}
                          fill={critical ? "#FEF2F2" : "#FFFFFF"}
                          stroke={
                            isSelected
                              ? "#C2552B"
                              : critical
                              ? "#EF4444"
                              : "#E7E5E0"
                          }
                          strokeWidth={isSelected ? 3 : 1.5}
                        />
                        {/* Цветная точка-статус */}
                        <circle
                          cx={node.x + 20}
                          cy={node.y + 20}
                          r={6}
                          fill={critical ? "#EF4444" : "#3A7D5C"}
                        />
                        {/* Название */}
                        <text
                          x={node.x + 34}
                          y={node.y + 24}
                          fontSize={13}
                          fontWeight={600}
                          fill={critical ? "#EF4444" : "#1F2937"}
                        >
                          {node.task.name.length > 24 ? node.task.name.slice(0, 23) + "…" : node.task.name}
                        </text>
                        {/* Длительность */}
                        <text x={node.x + 16} y={node.y + 52} fontSize={11} fill="#6B7280">
                          ⏱ {node.task.duration_days} дн.
                        </text>
                        {/* Запас / критическая */}
                        <text
                          x={node.x + 16}
                          y={node.y + 72}
                          fontSize={11}
                          fontWeight={500}
                          fill={critical ? "#EF4444" : hasFloat ? "#3A7D5C" : "#6B7280"}
                        >
                          {critical ? "🔥 Критическая" : hasFloat ? `✓ Запас ${node.task.total_float} дн.` : "Без расчёта"}
                        </text>
                        {/* Фактический план */}
                        {node.task.actual_start !== null && (
                          <text x={node.x + 16} y={node.y + 92} fontSize={10} fill="#6B7280">
                            📅 День {node.task.actual_start}–{node.task.actual_finish}
                          </text>
                        )}
                        {/* Бейдж CRITICAL в правом верхнем углу */}
                        {critical && (
                          <>
                            <rect
                              x={node.x + NODE_W - 68}
                              y={node.y + 8}
                              width={60}
                              height={18}
                              rx={9}
                              fill="#EF4444"
                            />
                            <text
                              x={node.x + NODE_W - 38}
                              y={node.y + 21}
                              fontSize={9}
                              fontWeight={700}
                              fill="#FFFFFF"
                              textAnchor="middle"
                              letterSpacing="0.05em"
                            >
                              CRITICAL
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Правая часть: детальная панель */}
            <div className="graph-detail-panel">
              {selected !== null ? (
                <div className="fade-in">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                      {selected.name}
                    </h3>
                    {selected.is_critical ? (
                      <Badge tone="critical">Критическая</Badge>
                    ) : selected.total_float !== null && selected.total_float > 0 ? (
                      <Badge tone="ok">Запас {selected.total_float} дн.</Badge>
                    ) : (
                      <Badge tone="muted">Не рассчитано</Badge>
                    )}
                  </div>

                  <div className="detail-row">
                    <span className="detail-label">Длительность:</span>
                    <span className="detail-value">{selected.duration_days} дн.</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Раннее начало (ES):</span>
                    <span className="detail-value">{formatDay(selected.earliest_start)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Раннее окончание (EF):</span>
                    <span className="detail-value">{formatDay(selected.earliest_finish)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Позднее начало (LS):</span>
                    <span className="detail-value">{formatDay(selected.latest_start)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Позднее окончание (LF):</span>
                    <span className="detail-value">{formatDay(selected.latest_finish)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Полный резерв (TF):</span>
                    <span className="detail-value">{selected.total_float !== null ? `${selected.total_float} дн.` : "—"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Свободный резерв (FF):</span>
                    <span className="detail-value">{selected.free_float !== null ? `${selected.free_float} дн.` : "—"}</span>
                  </div>
                  {selected.actual_start !== null && (
                    <>
                      <div style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Фактический план
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Старт:</span>
                        <span className="detail-value">{formatDay(selected.actual_start)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Финиш:</span>
                        <span className="detail-value">{formatDay(selected.actual_finish)}</span>
                      </div>
                    </>
                  )}

                  <div className="detail-actions">
                    <Button variant="ghost" onClick={() => navigate(tasksHref)}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>←</span> К задачам
                      </span>
                    </Button>
                    <Button variant="primary" onClick={() => void recalculate()} disabled={calcBusy}>
                      {calcBusy ? <Spinner /> : "Обновить план"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <div style={{ fontSize: 40, marginBottom: 12 }}>👆</div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Выберите задачу</div>
                  <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
                    Кликните по карточке задачи слева, чтобы увидеть детали: резервы, сроки, критический путь.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="hint-panel" style={{ marginTop: 16 }}>
            <strong>Как читать граф:</strong> стрелка ведёт от предшественника к последователю. Подпись на стрелке — особая связь (например, «FF +2»). Красным выделена критическая цепочка — задачи без запаса. Одиночные узлы слева — задачи без зависимостей, свяжите их на странице «Задачи». Кликните узел, чтобы открыть детали справа.
          </div>
        </>
      )}
    </section>
  );
}
