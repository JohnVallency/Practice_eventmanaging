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
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api } from "../services/api";
import { describeError } from "../services/errors";
import type { Task, TaskDependency, Event } from "../types";
import { Badge, Button, EmptyState, Skeleton, Spinner, useToast } from "../components/ui";

interface TaskNodeData extends Record<string, unknown> {
  task: Task;
  selected: boolean;
  onSelect: (taskId: string) => void;
  category?: string | null;
}

type TaskFlowNode = Node<TaskNodeData, "task">;

interface CategoryGroup {
  id: string;
  name: string;
  color: string;
  yStart: number;
  yEnd: number;
}

/** Цвета категорий для группировки задач */
const CATEGORY_COLORS: Record<string, string> = {
  Музыка: "#7c3aed",
  Свет: "#f59e0b",
  Декор: "#10b981",
  Кейтеринг: "#ef4444",
  Логистика: "#3b82f6",
  Безопасность: "#6b7280",
};

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

/** День в миллисекундах, масштаб оси и её вертикальное смещение над узлами. */
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Максимально широкий шаг между днями: один день = 480px — места хватает на часовые подписи. */
const PX_PER_DAY = 480;
const AXIS_X0 = 150;
const AXIS_Y = -120;
/** Ось охватывает: (сегодня − 7 дней) … (дата мероприятия + 7 дней). */
const AXIS_PAD_BEFORE_DAYS = 7;
const AXIS_PAD_AFTER_DAYS = 7;
const AXIS_MIN_SPAN_DAYS = 21;
/** При такой экранной ширине дня на оси появляются часовые отметки со временем. */
const AXIS_HOURS_THRESHOLD_PX = 240;
/** Минимальная экранная ширина одного временного интервала, чтобы подпись «12:00–14:00» влезла. */
const AXIS_HOUR_LABEL_MIN_PX = 70;

function startOfDay(value: Date): Date {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDateShort(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(value);
}

function formatTimeShort(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(value);
}

interface AxisLineData extends Record<string, unknown> {
  width: number;
}

interface AxisTickData extends Record<string, unknown> {
  label: string;
  kind: "start" | "tick" | "event" | "hour";
  /** Мелкая насечка без подписи: все дни размечены, подписи включаются при увеличении. */
  minor?: boolean;
}

interface DueLineData extends Record<string, unknown> {
  height: number;
  overdue: boolean;
}

/** Узел графа: задача либо элемент оси/линии дедлайна. */
type GraphNode =
  | TaskFlowNode
  | Node<AxisLineData, "axisLine">
  | Node<AxisTickData, "axisTick">
  | Node<DueLineData, "dueLine">;

/**
 * Строит узлы оси таймлайна: линию, отметки дат и маркер даты мероприятия.
 * Ось живёт в системе координат графа — панорамируется и зумится вместе с ним,
 * но линия всегда натянута от левого до правого края видимой области окна графа,
 * а шаг тиков подстраивается под масштаб (запас ±500px не даёт линии «дышать» при пане).
 */
function buildAxisNodes(
  timeline: AxisModel,
  viewLeftX: number,
  viewRightX: number,
  zoom: number,
): GraphNode[] {
  const { start: timelineStart, totalDays, eventEnd, todayIndex, eventIndex } = timeline;
  const timelineRightX = AXIS_X0 + Math.max(totalDays, 1) * PX_PER_DAY;

  // Линия оси: от левого края окна до правого (в координатах графа)
  const lineLeft = Math.min(viewLeftX, AXIS_X0) - 500;
  const lineRight = Math.max(viewRightX, timelineRightX) + 500;
  const lineWidth = lineRight - lineLeft;

  const axisNodes: GraphNode[] = [
    {
      id: "axis-line",
      type: "axisLine",
      position: { x: lineLeft, y: AXIS_Y },
      data: { width: lineWidth },
      style: { width: lineWidth, height: 4, zIndex: 0, pointerEvents: "none" },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
    },
  ];

  // Видимый диапазон дней на оси (с запасом в один день с каждой стороны)
  const firstDay = Math.max(0, Math.floor((viewLeftX - AXIS_X0) / PX_PER_DAY) - 1);
  const lastDay = Math.min(totalDays, Math.ceil((viewRightX - AXIS_X0) / PX_PER_DAY) + 1);
  if (lastDay < firstDay) return axisNodes;

  const pxPerDay = PX_PER_DAY * zoom;
  const showHours = pxPerDay >= AXIS_HOURS_THRESHOLD_PX;
  /** Ключ тика → позиция в массиве: позволяет «повысить» мелкую насечку до подписи. */
  const tickIndex = new Map<string, number>();

  /** Считает подпись и тип отметки для конкретного дня/часа. */
  const buildTickMeta = (day: number, hour: number | null, hourStep: number): Pick<AxisTickData, "label" | "kind"> => {
    const tickDate = new Date(timelineStart.getTime() + day * DAY_MS + (hour ?? 0) * HOUR_MS);
    const isEvent = eventIndex !== null && day === eventIndex && hour === null;
    const isToday = day === todayIndex && hour === null;
    const kind: AxisTickData["kind"] =
      isToday ? "start" : isEvent ? "event" : hour === null ? "tick" : "hour";
    const label = isEvent
      ? `Мероприятие · ${formatDateShort(eventEnd as Date)}`
      : isToday
        ? `Сегодня · ${formatDateShort(tickDate)}`
        : hour === null
          ? formatDateShort(tickDate)
          : `${formatTimeShort(tickDate)}–${formatTimeShort(new Date(tickDate.getTime() + hourStep * HOUR_MS))}`;
    return { label, kind };
  };

  /** Собирает узел отметки оси: насечку без подписи либо подписанный тик. */
  const buildTickNode = (day: number, hour: number | null, hourStep: number, labeled: boolean): GraphNode => {
    const meta = buildTickMeta(day, hour, hourStep);
    return {
      id: `axis-tick-${meta.kind}-${day}${hour !== null ? `-${hour}h` : ""}`,
      type: "axisTick",
      position: { x: AXIS_X0 + day * PX_PER_DAY + (hour ?? 0) * (PX_PER_DAY / 24), y: AXIS_Y },
      data: { ...meta, minor: !labeled },
      style: { width: 2, height: 16, zIndex: 0, pointerEvents: "none" },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
    };
  };

  /** Добавляет тик; hour === 0 трактуется как дневная отметка (полночь = новый день).
   *  Часовые тики подписываются интервалом «12:00–14:00» по шагу часовой сетки.
   *  labeled === false — насечка без подписи (день размечен, но подпись не влезает).
   *  Повторный вызов с labeled === true «повышает» уже стоящую насечку до подписи. */
  const pushTick = (day: number, hour: number | null, hourStep = 0, labeled = true): void => {
    if (hour === 0) hour = null;
    const key = `${day}:${hour ?? "day"}`;
    const existing = tickIndex.get(key);
    if (existing !== undefined) {
      if (!labeled) return;
      const prevData = axisNodes[existing].data as unknown as AxisTickData;
      if (!prevData.minor) return;
      axisNodes[existing] = buildTickNode(day, hour, hourStep, true);
      return;
    }

    tickIndex.set(key, axisNodes.length);
    axisNodes.push(buildTickNode(day, hour, hourStep, labeled));
  };

  // Дневная разметка присутствует всегда: каждый день диапазона получает насечку,
  // подпись — только если день достаточно широкий на экране
  const stepCandidates = [1, 2, 3, 7, 14, 30, 60, 90, 180, 365];
  const labelStep = stepCandidates.find((step) => step * pxPerDay >= 50) ?? 365;
  const minorStep = stepCandidates.find((step) => step * pxPerDay >= 6) ?? 365;
  for (let day = Math.ceil(firstDay / minorStep) * minorStep; day <= lastDay; day += minorStep) {
    pushTick(day, null, 0, day % labelStep === 0);
  }

  if (showHours) {
    // Часовой режим: чем крупнее масштаб, тем мельче интервал — вплоть до часа
    const pxPerHour = pxPerDay / 24;
    const hourSteps = [1, 2, 3, 4, 6, 8, 12];
    const stepHours = hourSteps.find((step) => step * pxPerHour >= AXIS_HOUR_LABEL_MIN_PX) ?? 12;
    const firstHour = Math.max(0, firstDay * 24);
    const lastHour = Math.min(totalDays * 24, (lastDay + 1) * 24);
    for (let hour = Math.ceil(firstHour / stepHours) * stepHours; hour <= lastHour; hour += stepHours) {
      pushTick(Math.floor(hour / 24), hour % 24, stepHours);
    }
  }

  // Ключевые отметки — всегда, независимо от шага: «Сегодня» и дата мероприятия
  pushTick(todayIndex, null);
  if (eventIndex !== null) pushTick(eventIndex, null);

  return axisNodes;
}

/**
 * Строит вертикальные линии дедлайна: от оси вниз до самой нижней задачи
 * на каждой дате с дедлайном. Просроченные дедлайны рисуются красным.
 */
function buildDueLines(
  tasks: Task[],
  timelineStart: Date,
  timelineEnd: Date,
  xForDate: (date: Date) => number,
  maxNodeBottom: number,
): GraphNode[] {
  const byDay = new Map<number, { count: number; overdue: boolean }>();
  const nowTime = Date.now();
  tasks.forEach((task) => {
    if (!task.due_date) return;
    const day = Math.round((startOfDay(new Date(task.due_date)).getTime() - timelineStart.getTime()) / DAY_MS);
    if (day < 0 || day > Math.round((timelineEnd.getTime() - timelineStart.getTime()) / DAY_MS)) return;
    const entry = byDay.get(day) ?? { count: 0, overdue: false };
    entry.count += 1;
    if (new Date(task.due_date).getTime() < nowTime && task.status !== "done" && task.status !== "cancelled") {
      entry.overdue = true;
    }
    byDay.set(day, entry);
  });

  const lines: GraphNode[] = [];
  byDay.forEach((entry, day) => {
    lines.push({
      id: `due-line-${day}`,
      type: "dueLine",
      position: { x: xForDate(new Date(timelineStart.getTime() + day * DAY_MS)), y: AXIS_Y },
      data: { height: Math.max(maxNodeBottom - AXIS_Y + 30, 200), overdue: entry.overdue },
      style: { width: 2, height: Math.max(maxNodeBottom - AXIS_Y + 30, 200), zIndex: 1 },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
    });
  });
  return lines;
}

interface AxisModel {
  start: Date;
  totalDays: number;
  eventEnd: Date | null;
  /** Индекс дня «сегодня» на оси (0 — начало диапазона, а не сегодня). */
  todayIndex: number;
  /** Индекс дня мероприятия на оси (может быть null, если дата не задана). */
  eventIndex: number | null;
}

interface GraphModel {
  taskNodes: TaskFlowNode[];
  dueLineNodes: GraphNode[];
  edges: Edge[];
  categoryGroups: CategoryGroup[];
  /** Границы оси: нужны компоненту, чтобы растянуть линию по всей ширине окна. */
  timeline: AxisModel | null;
}

/**
 * Вычисляет позицию узлов по дедлайнам и оси таймлайна.
 * Ось начинается «сегодня» (или раньше — с самого раннего дедлайна),
 * а заканчивается датой мероприятия; X задачи = её дедлайн на оси.
 */
function calculateNodePositions(
  tasks: Task[],
  dependencies: TaskDependency[],
  event: Event | null,
  selectedId: string | null,
): GraphModel {
  if (tasks.length === 0) {
    return { taskNodes: [], dueLineNodes: [], edges: [], categoryGroups: [], timeline: null };
  }

  // Границы оси: (сегодня − 7 дней) … (дата мероприятия + 7 дней).
  // Если дедлайны задач выходят за эти пределы — ось расширяется, чтобы всё было видно.
  const now = startOfDay(new Date());
  const eventEnd = event?.end_date ? startOfDay(new Date(event.end_date)) : null;
  const dueDates = tasks
    .filter((task) => task.due_date)
    .map((task) => startOfDay(new Date(task.due_date as string)));

  let timelineStart = new Date(now.getTime() - AXIS_PAD_BEFORE_DAYS * DAY_MS);
  dueDates.forEach((due) => {
    if (due < timelineStart) timelineStart = due;
  });

  let timelineEnd = new Date((eventEnd ?? now).getTime() + AXIS_PAD_AFTER_DAYS * DAY_MS);
  dueDates.forEach((due) => {
    if (due > timelineEnd) timelineEnd = due;
  });
  if (timelineEnd.getTime() - timelineStart.getTime() < AXIS_MIN_SPAN_DAYS * DAY_MS) {
    timelineEnd = new Date(timelineStart.getTime() + AXIS_MIN_SPAN_DAYS * DAY_MS);
  }

  const totalDays = Math.max(
    1,
    Math.round((timelineEnd.getTime() - timelineStart.getTime()) / DAY_MS),
  );
  /** Индексы дня «сегодня» и дня мероприятия — от начала диапазона оси. */
  const todayIndex = Math.round((now.getTime() - timelineStart.getTime()) / DAY_MS);
  const eventIndex = eventEnd
    ? Math.round((eventEnd.getTime() - timelineStart.getTime()) / DAY_MS)
    : null;
  const xForDate = (date: Date): number => {
    const days = (date.getTime() - timelineStart.getTime()) / DAY_MS;
    return AXIS_X0 + days * PX_PER_DAY;
  };

  // Группируем задачи по категориям
  const byCategory = new Map<string | null, Task[]>();
  tasks.forEach((task) => {
    const category = task.category ?? null;
    byCategory.set(category, [...(byCategory.get(category) ?? []), task]);
  });

  const categories = Array.from(byCategory.keys());
  const categoryHeight = 200;
  const verticalSpacing = 56;

  const taskNodes: TaskFlowNode[] = [];
  const categoryGroups: CategoryGroup[] = [];
  
  categories.forEach((category, catIndex) => {
    const categoryTasks = byCategory.get(category) ?? [];
    
    // Сортируем задачи по времени внутри категории
    categoryTasks.sort((a, b) => {
      const aTime = a.earliest_start ?? a.earliest_finish ?? 0;
      const bTime = b.earliest_start ?? b.earliest_finish ?? 0;
      return aTime - bTime;
    });
    
    const yStart = catIndex * (categoryHeight + verticalSpacing) - 30;
    
    // Сохраняем информацию о группе категории для отрисовки фона
    if (category) {
      categoryGroups.push({
        id: `cat-${category}`,
        name: category,
        color: CATEGORY_COLORS[category] ?? "#c6b9a2",
        yStart,
        yEnd: yStart + categoryHeight + (categoryTasks.length - 1) * 150 + 50,
      });
    }
    
    categoryTasks.forEach((task, taskIndex) => {
      // Позиция X привязана к дедлайну задачи на оси таймлайна
      const taskDate = task.due_date ? startOfDay(new Date(task.due_date)) : timelineStart;
      const x = xForDate(taskDate);
      
      // Позиция Y основана на категории и индексе задачи
      const y = yStart + 30 + taskIndex * 150;
      
      // Задачи всегда рисуются поверх рёбер (zIndex: 10) — стрелки не «окутывают» карточки
  taskNodes.push({
        id: task.id,
        type: "task",
        position: { x, y },
        data: { 
          task, 
          selected: task.id === selectedId, 
          onSelect: () => {},
          category: task.category,
        },
        style: {
          borderColor: category ? CATEGORY_COLORS[category] ?? "#c6b9a2" : undefined,
        },
        zIndex: 10,
      });
    });
  });

  // Создаем ребра
  const taskIds = new Set(tasks.map((task) => task.id));
  const taskEdges: Edge[] = dependencies
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
        style: { stroke, strokeWidth: critical ? 2 : 1.2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 },
        zIndex: 0,
      };
    });

  // Линии дедлайна: от оси вниз до самого нижнего узла
  const maxNodeBottom = taskNodes.reduce((max, node) => Math.max(max, node.position.y + 160), 0);
  const dueLines = buildDueLines(tasks, timelineStart, timelineEnd, xForDate, maxNodeBottom);

  return {
    taskNodes,
    dueLineNodes: dueLines,
    edges: taskEdges,
    categoryGroups,
    timeline: { start: timelineStart, totalDays, eventEnd, todayIndex, eventIndex },
  };
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

const nodeTypes = { task: TaskNode, axisLine: AxisLineNode, axisTick: AxisTickNode, dueLine: DueLineNode };

/** Горизонтальная линия таймлайна в координатах графа. */
function AxisLineNode({ data }: NodeProps): JSX.Element {
  const { width } = data as unknown as AxisLineData;
  return <div className="axis-line" style={{ width }} />;
}

/** Отметка даты на оси: обычный тик, «сегодня», маркер мероприятия или мелкая насечка. */
function AxisTickNode({ data }: NodeProps): JSX.Element {
  const { label, kind, minor } = data as unknown as AxisTickData;
  return (
    <div className={`axis-tick axis-tick--${kind} ${minor ? "axis-tick--minor" : ""}`}>
      {minor ? null : <span className="axis-tick__label">{label}</span>}
      <span className="axis-tick__rule" />
    </div>
  );
}

/** Вертикальный «столбик» дедлайна: соединяет ось с карточкой задачи. */
function DueLineNode({ data }: NodeProps): JSX.Element {
  const { height, overdue } = data as unknown as DueLineData;
  return <div className={`due-line ${overdue ? "due-line--overdue" : ""}`} style={{ height }} />;
}

/** Трекер вьюпорта: сообщает странице текущие pan/zoom, чтобы ось следовала за масштабом. */
function ViewportTracker({
  onChange,
}: {
  onChange: (viewport: { x: number; y: number; zoom: number }) => void;
}): JSX.Element | null {
  const viewport = useViewport();
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onChangeRef.current(viewport);
  }, [viewport]);
  return null;
}

export default function EventGraphPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { push } = useToast();
  const pushRef = useRef(push);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deps, setDeps] = useState<TaskDependency[]>([]);
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  /** Идентификатор выбранного ребра — открывает управление связью. */
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [depBusy, setDepBusy] = useState(false);
  /** Вьюпорт графа: ось пересобирается под видимую область при пане/зуме. */
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  /** Ширина окна графа — ось тянется от его левого до правого края. */
  const [flowPanel, setFlowPanel] = useState<HTMLDivElement | null>(null);
  const [flowWidth, setFlowWidth] = useState(1200);
  /** Экземпляр графа: нужен для программного центрирования вида на «сегодня». */
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  /** Стартовый фокус выполняется один раз — при появлении задач и границ оси. */
  const initialFocusDone = useRef(false);

  useEffect(() => {
    if (!flowPanel) return;
    setFlowWidth(flowPanel.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setFlowWidth(width);
    });
    observer.observe(flowPanel);
    return () => observer.disconnect();
  }, [flowPanel]);

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
      const [taskData, eventData] = await Promise.all([
        api.tasks.listAll(id),
        api.events.get(id).catch(() => null),
      ]);
      const dependencyLists = await Promise.all(
        taskData.map((task) => api.dependencies.list(task.id).catch(() => [])),
      );
      setTasks(taskData);
      setEvent(eventData);
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
    if (tasks.length === 0) {
      return { taskNodes: [], dueLineNodes: [], edges: [], categoryGroups: [], timeline: null } as GraphModel;
    }
    // Используем новую функцию для расчета позиций на основе времени и категорий
    return calculateNodePositions(tasks, deps, event, selectedId);
  }, [deps, event, selectedId, tasks]);

  /** Ось таймлайна: тянется по всей ширине окна графа и движется вместе с зумом. */
  const axisNodes = useMemo(() => {
    const timeline = graphModel.timeline;
    if (!timeline) return [] as GraphNode[];
    const viewLeftX = -viewport.x / viewport.zoom;
    const viewRightX = (flowWidth - viewport.x) / viewport.zoom;
    return buildAxisNodes(timeline, viewLeftX, viewRightX, viewport.zoom);
  }, [flowWidth, graphModel, viewport]);

  useEffect(() => {
    setNodes([...axisNodes, ...graphModel.dueLineNodes, ...graphModel.taskNodes]);
    setEdges(graphModel.edges);
    setCategoryGroups(graphModel.categoryGroups);
  }, [axisNodes, graphModel]);

  const selected = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [selectedId, tasks],
  );

  /** Центрирует вид на конкретном дне оси: показываем окно примерно в 7 дней. */
  const focusOnDay = useCallback(
    (dayIndex: number): void => {
      if (!flowInstance) return;
      const centerX = AXIS_X0 + dayIndex * PX_PER_DAY + PX_PER_DAY / 2;
      const zoom = Math.min(Math.max(flowWidth / (PX_PER_DAY * 7), 0.05), 1.2);
      void flowInstance.setCenter(centerX, 0, { zoom, duration: 500 });
    },
    [flowInstance, flowWidth],
  );

  /** Один раз при открытии графа ставим вид на «сегодня» — иначе 480px/день нечитаемы целиком. */
  useEffect(() => {
    if (!flowInstance || !graphModel.timeline || initialFocusDone.current) return;
    initialFocusDone.current = true;
    focusOnDay(graphModel.timeline.todayIndex);
  }, [flowInstance, focusOnDay, graphModel.timeline]);

  /** При переходе к другому событию фокус на «сегодня» выполняется заново. */
  useEffect(() => {
    initialFocusDone.current = false;
  }, [id]);

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
          {graphModel.timeline && (
            <Button variant="ghost" onClick={() => focusOnDay(graphModel.timeline?.todayIndex ?? 0)}>
              К сегодня
            </Button>
          )}
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
              <span>Кликните по узлу или связи — карточка откроется поверх графа.</span>
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
            <div className="graph-flow-panel" ref={setFlowPanel}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                connectionRadius={28}
                zoomOnDoubleClick={false}
                onNodeClick={(_, node) => {
                  if (node.type !== "task") return;
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
                onInit={setFlowInstance}
                minZoom={0.05}
                maxZoom={5}
                elevateEdgesOnSelect
                proOptions={{ hideAttribution: true }}
              >
                <ViewportTracker onChange={setViewport} />
                <Background gap={24} size={1} color={CANVAS_GRID} />
                <Controls position="bottom-left" showInteractive={false} />
                <MiniMap
                  nodeColor={(node) => {
                    const data = node.data as TaskNodeData | undefined;
                    return data?.task ? STATUS_COLORS[data.task.status] : "#c6b9a2";
                  }}
                  maskColor={CANVAS_MASK}
                />
                {/* Фоны категорий */}
                {categoryGroups.map((group) => (
                  <div
                    key={group.id}
                    className="category-band"
                    style={{
                      top: `${group.yStart}px`,
                      height: `${group.yEnd - group.yStart}px`,
                      backgroundColor: group.color,
                    }}
                  >
                    <span 
                      className="category-band__label"
                      style={{ borderColor: group.color, color: group.color }}
                    >
                      {group.name}
                    </span>
                  </div>
                ))}
              </ReactFlow>

              {(selectedEdgeDep || selected) && (
              <div className="graph-detail-panel graph-detail-panel--floating">
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
              ) : null}
              </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
