/**
 * Общие типы фронтенда EventLMS.
 * Контракты повторяют схемы Pydantic бэкенда (schemas/health.py).
 */

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
