/**
 * Barrel-реэкспорт типов фронтенда EventLMS.
 * Контракты повторяют схемы Pydantic бэкенда (backend/schemas/*.py).
 */

export type {
  Event,
  EventCreate,
  EventStatus,
  EventUpdate,
} from "./event";

export type {
  DependencyType,
  Task,
  TaskCreate,
  TaskDependency,
  TaskDependencyCreate,
  TaskUpdate,
  TaskStatus,
  TaskPriority,
  TaskComment,
  TaskHistory,
} from "./task";

export type {
  Assignment,
  AssignmentCreate,
  AssignmentUpdate,
  Resource,
  ResourceCreate,
  ResourceType,
  ResourceUpdate,
} from "./resource";

export type {
  BudgetSummaryResponse,
  Expense,
  ExpenseCreate,
  MapCenter,
  MapResponse,
  NotificationItem,
  NotificationResponse,
  ResourceScheduleItem,
  ResourceScheduleResponse,
  ResourceUtilization,
  ResourceUtilizationResponse,
  ScheduleCalculationResponse,
  ScheduleItem,
  Venue,
  VenueCreate,
} from "./schedule";

/* ------------------------ Прочие общие типы UI --------------------------- */

export interface HealthResponse {
  status: string;
}

export type ApiStatus = "idle" | "loading" | "online" | "offline";

export interface ApiState {
  status: ApiStatus;
  health: HealthResponse | null;
  error: string | null;
  checkedAt: string | null;
}
