/**
 * Типизированный API-клиент EventLMS.
 * Базовый URL берётся из VITE_API_BASE_URL, по умолчанию — локальный бэкенд.
 */

import type { HealthResponse } from "../types";

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

/**
 * Ошибка сетевого слоя API: содержит HTTP-статус, если ответ получен.
 */
export class ApiError extends Error {
  public readonly statusCode: number | null;

  constructor(message: string, statusCode: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

/**
 * Запросить состояние живости бэкенда.
 *
 * @returns Тело ответа GET /health.
 * @throws ApiError при сетевой ошибке или не-200 ответе.
 */
export async function getHealth(): Promise<HealthResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiError("Бэкенд недоступен: сеть недостижима");
  }

  if (!response.ok) {
    throw new ApiError(`Бэкенд вернул статус ${response.status}`, response.status);
  }

  return (await response.json()) as HealthResponse;
}

export { API_BASE_URL };
