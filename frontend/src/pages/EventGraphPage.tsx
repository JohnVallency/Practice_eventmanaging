/**
 * Страница визуализации графа задач /events/:id/graph (SVG, без библиотек).
 * Слои по наибольшему пути от источников, bezier-рёбра, панель выбранного узла.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../services/api";
import { describeError } from "../services/errors";
import type { Task, TaskDependency } from "../types";
import { Badge, Button, EmptyState, Skeleton, Spinner, useToast } from "../components/ui";

/* --------------------------- Геометрия графа ------------------------------ */

const NODE_W = 168;
const NODE_H = 44;
const GAP_X = 56;
const GAP_Y = 24;
const PADDING = 24;

const COLOR_EDGE = "#D1D5DB";
const COLOR_EDGE_CRITICAL = "#DC2626";
const COLOR_LABEL = "#6B7280";
const COLOR_NODE_FILL = "#FFFFFF";
const COLOR_NODE_STROKE = "#E7E5E0";
const COLOR_CRITICAL_FILL = "#FEF2F2";
const COLOR_CRITICAL_STROKE = "#DC2626";
const COLOR_NODE_TEXT = "#1F2937";
const COLOR_SELECTED = "#111827";

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

/** Обрезка имени до 18 символов с многоточием. */
function truncateName(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
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

    // Списки предшественников и последователей (уникальные пары).
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

    // Слой = наибольший путь от источника: memoized DFS по successor-грани.
    const layerCache = new Map<string, number>();
    const layerOf = (taskId: string): number => {
      const cached = layerCache.get(taskId);
      if (cached !== undefined) {
        return cached;
      }
      // Временная метка защищает от цикла в данных (бэкенд циклы отклоняет).
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

    // Узлы: группировка по слоям, сортировка по имени внутри слоя.
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

    const width = Math.max(PADDING * 2 + layerCount * NODE_W + (layerCount - 1) * GAP_X, 400);
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
      <style>{`
        .graph-node { cursor: pointer; }
        .graph-node rect { transition: stroke 120ms ease; }
        .graph-node:hover rect { stroke: ${COLOR_SELECTED}; }
        .graph-node--selected rect { stroke: ${COLOR_SELECTED}; }
      `}</style>

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

          <div className="graph-panel" style={{ overflow: "auto" }}>
            <svg
              role="img"
              aria-label="Граф зависимостей задач"
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              style={{ display: "block" }}
            >
              {layout.edges.map((edge) => {
                const x1 = edge.from.x + NODE_W;
                const y1 = edge.from.y + NODE_H / 2;
                const x2 = edge.to.x;
                const y2 = edge.to.y + NODE_H / 2;
                const showLabel = edge.type !== "FS" || edge.lag !== 0;
                return (
                  <g key={edge.key}>
                    <path
                      d={`M ${x1} ${y1} C ${x1 + 28} ${y1}, ${x2 - 28} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={edge.critical ? COLOR_EDGE_CRITICAL : COLOR_EDGE}
                      strokeWidth={edge.critical ? 2 : 1.5}
                    />
                    {showLabel && (
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 - 4}
                        textAnchor="middle"
                        fontSize={10}
                        fill={COLOR_LABEL}
                      >
                        {edge.type === "FS" ? `${edge.lag} дн.` : `${edge.type} · ${edge.lag} дн.`}
                      </text>
                    )}
                  </g>
                );
              })}
              {layout.nodes.map((node) => {
                const critical = node.task.is_critical;
                const isSelected = node.task.id === selectedId;
                return (
                  <g
                    key={node.task.id}
                    className={isSelected ? "graph-node graph-node--selected" : "graph-node"}
                    onClick={() => setSelectedId(node.task.id)}
                  >
                    <title>
                      {node.task.name} — {node.task.duration_days} дн. Кликните для деталей
                    </title>
                    <rect
                      x={node.x}
                      y={node.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={8}
                      fill={critical ? COLOR_CRITICAL_FILL : COLOR_NODE_FILL}
                      stroke={isSelected ? COLOR_SELECTED : critical ? COLOR_CRITICAL_STROKE : COLOR_NODE_STROKE}
                      strokeWidth={1.5}
                    />
                    <text
                      x={node.x + 12}
                      y={node.y + 19}
                      fontSize={12}
                      fill={critical ? COLOR_CRITICAL_STROKE : COLOR_NODE_TEXT}
                    >
                      {truncateName(node.task.name)}
                    </text>
                    <text
                      x={node.x + 12}
                      y={node.y + 34}
                      fontSize={11}
                      fill={COLOR_LABEL}
                    >
                      · {node.task.duration_days} дн
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="hint-panel" style={{ marginTop: 12 }}>
            Граф показывает порядок работ: стрелка от предшественника к последователю. Подпись на
            стрелке — особая связь (например, «Финиш–Финиш · 2 дн.»). Красным выделена критическая
            цепочка — задачи без запаса: задержка любой двигает весь проект. Одиночные узлы слева —
            задачи без зависимостей: свяжите их на странице «Задачи» → кнопка «Зависимости», чтобы
            получить цепочку и план. Правая панель показывает детали выбранной задачи, там же кнопка
            «Обновить план».
          </div>

          {selected !== null && (
            <div className="card graph-node-card fade-in" style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong>{selected.name}</strong>
                {selected.is_critical ? (
                  <Badge tone="critical">Критическая</Badge>
                ) : (
                  <Badge tone="muted">Резерв TF: {selected.total_float ?? "—"} дн.</Badge>
                )}
              </div>
              <div className="muted">
                ES: {formatDay(selected.earliest_start)} · EF: {formatDay(selected.earliest_finish)}{" "}
                · LS: {formatDay(selected.latest_start)} · LF: {formatDay(selected.latest_finish)}
              </div>
              <div className="toolbar">
                <Button variant="sm" onClick={() => navigate(tasksHref)}>
                  К задачам
                </Button>
                <Button variant="sm" onClick={() => void recalculate()} disabled={calcBusy}>
                  Обновить план
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
