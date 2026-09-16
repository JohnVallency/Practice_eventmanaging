/**
 * Типизированный API-клиент EventLMS на axios.
 *
 * Базовый URL — из VITE_API_BASE_URL (по умолчанию http://localhost:8000/api).
 * withoutCredentials: CORS бэкенда без credentials — withCredentials не ставится.
 * Ошибки не глотаются: интерцептор нормализует 401/404/500 в ApiError,
 * прочие — пробрасываются как есть.
 */

import axios, { type AxiosInstance, type AxiosResponse } from "axios";

import type {
  Assignment,
  AssignmentCreate,
  AssignmentUpdate,
  BudgetSummaryResponse,
  Event,
  EventCreate,
  EventUpdate,
  Expense,
  ExpenseCreate,
  HealthResponse,
  MapResponse,
  NotificationItem,
  Resource,
  ResourceCreate,
  ResourceScheduleResponse,
  ResourceUpdate,
  ResourceUtilizationResponse,
  ScheduleCalculationResponse,
  Task,
  TaskCreate,
  TaskDependency,
  TaskDependencyCreate,
  TaskUpdate,
  TaskStatus,
  TaskPriority,
  TaskComment,
  TaskHistory,
  Venue,
  VenueCreate,
} from "../types";

/** Базовый URL API (префикс /api бэкенда). */
const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

/** Корень сервера без суффикса /api — health-check живёт на GET /health. */
const SERVER_ROOT: string = API_BASE_URL.replace(/\/api\/?$/, "");

export { API_BASE_URL, SERVER_ROOT };

/** Доменная ошибка API: код, HTTP-статус и опциональные детали ответа. */
export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Вытащить {"detail": "..."} из тела ошибки FastAPI. */
function extractDetail(data: unknown): string | null {
  if (data !== null && typeof data === "object" && "detail" in data) {
    const detail: unknown = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
  }
  return null;
}

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: "application/json" },
});

/** Response-интерцептор: 401 -> событие api:unauthorized; 404/500 -> ApiError. */
client.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }
    const status: number | undefined = error.response?.status;
    const data: unknown = error.response?.data;
    const message: string = extractDetail(data) ?? error.message;

    if (status === 401) {
      window.dispatchEvent(
        new CustomEvent("api:unauthorized", { detail: { status, message } }),
      );
      throw new ApiError("UNAUTHORIZED", message, 401, data);
    }
    if (status === 404) {
      throw new ApiError("NOT_FOUND", message, 404, data);
    }
    if (status === 500) {
      throw new ApiError("SERVER_ERROR", message, 500, data);
    }
    // Прочие ошибки (400, 409, сеть, отмена) — проброс как есть.
    return Promise.reject(error);
  },
);

/** Достать тело типизированного ответа. */
async function unwrap<T>(request: Promise<AxiosResponse<T>>): Promise<T> {
  return (await request).data;
}

/** Параметры постраничной выдачи (Query skip/limit бэкенда). */
export interface PaginationParams {
  skip?: number;
  limit?: number;
}

export interface TaskListParams extends PaginationParams {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee?: string;
}

/** Фильтры списка назначений GET /assignments. */
export interface AssignmentListParams extends PaginationParams {
  task_id?: string;
  resource_id?: string;
}

async function listAllPages<T>(request: (params: PaginationParams) => Promise<T[]>): Promise<T[]> {
  const result: T[] = [];
  let skip = 0;
  const limit = 100;
  while (true) {
    const page = await request({ skip, limit });
    result.push(...page);
    if (page.length < limit) return result;
    skip += limit;
  }
}

/** GET /health — живёт в корне сервера, вне префикса /api. */
export async function getHealth(): Promise<HealthResponse> {
  return unwrap(client.get<HealthResponse>(`${SERVER_ROOT}/health`));
}

/**
 * Типизированные функции всех эндпоинтов бэкенда.
 * Пути сверены с backend/api/routes/*.py.
 */
export const api = {
  health: { get: getHealth },

  events: {
    /** GET /events?skip&limit */
    list(params?: PaginationParams): Promise<Event[]> {
      return unwrap(client.get<Event[]>("/events", { params }));
    },
    listAll(): Promise<Event[]> {
      return listAllPages((params) => this.list(params));
    },
    /** GET /events/{event_id} */
    get(eventId: string): Promise<Event> {
      return unwrap(client.get<Event>(`/events/${eventId}`));
    },
    /** POST /events -> 201 */
    create(data: EventCreate): Promise<Event> {
      return unwrap(client.post<Event>("/events", data));
    },
    /** PUT /events/{event_id} */
    update(eventId: string, data: EventUpdate): Promise<Event> {
      return unwrap(client.put<Event>(`/events/${eventId}`, data));
    },
    /** DELETE /events/{event_id} -> 204 */
    async delete(eventId: string): Promise<void> {
      await client.delete(`/events/${eventId}`);
    },
  },

  tasks: {
    /** GET /tasks?event_id&skip&limit (фильтр по событию — query-параметр). */
    list(eventId: string, params?: TaskListParams): Promise<Task[]> {
      return unwrap(
        client.get<Task[]>("/tasks", { params: { event_id: eventId, ...params } }),
      );
    },
    listAll(eventId: string): Promise<Task[]> {
      return listAllPages((params) => this.list(eventId, params));
    },
    /** GET /tasks/{task_id} */
    get(taskId: string): Promise<Task> {
      return unwrap(client.get<Task>(`/tasks/${taskId}`));
    },
    /** POST /tasks -> 201 (event_id — обязательное поле тела TaskCreate). */
    create(eventId: string, data: Omit<TaskCreate, "event_id">): Promise<Task> {
      return unwrap(client.post<Task>("/tasks", { ...data, event_id: eventId }));
    },
    /** PUT /tasks/{task_id} */
    update(taskId: string, data: TaskUpdate): Promise<Task> {
      return unwrap(client.put<Task>(`/tasks/${taskId}`, data));
    },
    /** DELETE /tasks/{task_id} -> 204 */
    async delete(taskId: string): Promise<void> {
      await client.delete(`/tasks/${taskId}`);
    },
    comments(taskId: string): Promise<TaskComment[]> {
      return unwrap(client.get<TaskComment[]>(`/tasks/${taskId}/comments`));
    },
    addComment(taskId: string, body: string, author = "Анна"): Promise<TaskComment> {
      return unwrap(client.post<TaskComment>(`/tasks/${taskId}/comments`, { body, author }));
    },
    history(taskId: string): Promise<TaskHistory[]> {
      return unwrap(client.get<TaskHistory[]>(`/tasks/${taskId}/history`));
    },
  },

  dependencies: {
    /** GET /tasks/{task_id}/dependencies */
    list(taskId: string): Promise<TaskDependency[]> {
      return unwrap(client.get<TaskDependency[]>(`/tasks/${taskId}/dependencies`));
    },
    /** POST /tasks/{task_id}/dependencies -> 201 (successor_id из пути). */
    create(
      taskId: string,
      data: Omit<TaskDependencyCreate, "successor_id">,
    ): Promise<TaskDependency> {
      return unwrap(
        client.post<TaskDependency>(`/tasks/${taskId}/dependencies`, {
          ...data,
          successor_id: taskId,
        }),
      );
    },
    /** DELETE /tasks/{task_id}/dependencies/{predecessor_id} -> 204. */
    async remove(taskId: string, predecessorId: string): Promise<void> {
      await client.delete(`/tasks/${taskId}/dependencies/${predecessorId}`);
    },
  },

  resources: {
    /** GET /resources?event_id&skip&limit (фильтр по событию — query-параметр). */
    list(eventId: string, params?: PaginationParams): Promise<Resource[]> {
      return unwrap(
        client.get<Resource[]>("/resources", {
          params: { event_id: eventId, ...params },
        }),
      );
    },
    /** GET /resources/{resource_id} */
    get(resourceId: string): Promise<Resource> {
      return unwrap(client.get<Resource>(`/resources/${resourceId}`));
    },
    /** POST /resources -> 201 (event_id — обязательное поле тела ResourceCreate). */
    create(eventId: string, data: Omit<ResourceCreate, "event_id">): Promise<Resource> {
      return unwrap(client.post<Resource>("/resources", { ...data, event_id: eventId }));
    },
    /** PUT /resources/{resource_id} */
    update(resourceId: string, data: ResourceUpdate): Promise<Resource> {
      return unwrap(client.put<Resource>(`/resources/${resourceId}`, data));
    },
    /** DELETE /resources/{resource_id} -> 204 */
    async delete(resourceId: string): Promise<void> {
      await client.delete(`/resources/${resourceId}`);
    },
  },

  assignments: {
    /** GET /assignments?task_id&resource_id&skip&limit. */
    list(params?: AssignmentListParams): Promise<Assignment[]> {
      return unwrap(client.get<Assignment[]>("/assignments", { params }));
    },
    listAll(params?: Omit<AssignmentListParams, "skip" | "limit">): Promise<Assignment[]> {
      return listAllPages((page) => this.list({ ...params, ...page }));
    },
    /** GET /assignments/{assignment_id} */
    get(assignmentId: string): Promise<Assignment> {
      return unwrap(client.get<Assignment>(`/assignments/${assignmentId}`));
    },
    /** POST /assignments -> 201 */
    create(data: AssignmentCreate): Promise<Assignment> {
      return unwrap(client.post<Assignment>("/assignments", data));
    },
    /** PUT /assignments/{assignment_id} */
    update(assignmentId: string, data: AssignmentUpdate): Promise<Assignment> {
      return unwrap(client.put<Assignment>(`/assignments/${assignmentId}`, data));
    },
    /** DELETE /assignments/{assignment_id} -> 204 */
    async delete(assignmentId: string): Promise<void> {
      await client.delete(`/assignments/${assignmentId}`);
    },
  },

  schedule: {
    /** POST /events/{event_id}/schedule/calculate — полный CPM. */
    calculate(eventId: string): Promise<ScheduleCalculationResponse> {
      return unwrap(
        client.post<ScheduleCalculationResponse>(`/events/${eventId}/schedule/calculate`),
      );
    },
  },

  resourcesSchedule: {
    /** POST /events/{event_id}/schedule/resource — серийный SGS (RCPSP). */
    calculate(eventId: string): Promise<ResourceScheduleResponse> {
      return unwrap(
        client.post<ResourceScheduleResponse>(`/events/${eventId}/schedule/resource`),
      );
    },
    /** GET /events/{event_id}/resources/utilization — загрузка по дням. */
    utilization(eventId: string): Promise<ResourceUtilizationResponse> {
      return unwrap(
        client.get<ResourceUtilizationResponse>(`/events/${eventId}/resources/utilization`),
      );
    },
  },

  finances: {
    /** GET /events/{event_id}/expenses */
    listExpenses(eventId: string): Promise<Expense[]> {
      return unwrap(client.get<Expense[]>(`/events/${eventId}/expenses`));
    },
    /** POST /events/{event_id}/expenses -> 201 */
    createExpense(eventId: string, data: ExpenseCreate): Promise<Expense> {
      return unwrap(client.post<Expense>(`/events/${eventId}/expenses`, data));
    },
    /** GET /events/{event_id}/budget/summary */
    budgetSummary(eventId: string): Promise<BudgetSummaryResponse> {
      return unwrap(
        client.get<BudgetSummaryResponse>(`/events/${eventId}/budget/summary`),
      );
    },
  },

  venues: {
    /** GET /events/{event_id}/venues */
    listVenues(eventId: string): Promise<Venue[]> {
      return unwrap(client.get<Venue[]>(`/events/${eventId}/venues`));
    },
    /** POST /events/{event_id}/venues -> 201 */
    createVenue(eventId: string, data: VenueCreate): Promise<Venue> {
      return unwrap(client.post<Venue>(`/events/${eventId}/venues`, data));
    },
    /** GET /events/{event_id}/map */
    map(eventId: string): Promise<MapResponse> {
      return unwrap(client.get<MapResponse>(`/events/${eventId}/map`));
    },
  },

  notifications: {
    /** GET /events/{event_id}/notifications */
    list(eventId: string): Promise<NotificationItem[]> {
      return unwrap(client.get<NotificationItem[]>(`/events/${eventId}/notifications`));
    },
  },
} as const;
