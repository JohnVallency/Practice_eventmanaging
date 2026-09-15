/**
 * Контракты расчётов, финансов, карт и уведомлений — зеркала
 * backend/schemas/schedule.py, resource_scheduling.py, expense.py,
 * venue.py, notification.py (плюс форма ответов из сервисов).
 */

import type { ResourceType } from "./resource";

/* ============================= CPM-расписание ============================= */

/** Полный CPM-результат одной задачи (ScheduleItem). */
export interface ScheduleItem {
  earliest_start: number;
  earliest_finish: number;
  latest_start: number;
  latest_finish: number;
  total_float: number;
  free_float: number;
  is_critical: boolean;
}

/** Ответ POST /events/{id}/schedule/calculate (ScheduleCalculationResponse). */
export interface ScheduleCalculationResponse {
  event_id: string;
  calculated: number;
  schedule: Record<string, ScheduleItem>;
  /** id критических задач в топологическом порядке. */
  critical_path: string[];
  project_duration: number;
}

/* ========================== Ресурсное расписание ========================== */

/** Фактические даты одной задачи после серийного SGS (ResourceScheduleItem). */
export interface ResourceScheduleItem {
  actual_start: number;
  actual_finish: number;
  delay_days: number;
  is_critical: boolean;
}

/** Ответ POST /events/{id}/schedule/resource (ResourceScheduleResponse). */
export interface ResourceScheduleResponse {
  event_id: string;
  calculated: number;
  schedule: Record<string, ResourceScheduleItem>;
  resource_project_duration: number;
}

/** Профиль загрузки одного ресурса по дням (ResourceUtilization). */
export interface ResourceUtilization {
  resource_id: string;
  resource_name: string;
  resource_type: ResourceType;
  availability_per_day: number;
  /** {день: сумма units} — только дни с загрузкой > 0. */
  allocated_by_day: Record<string, number>;
  peak_allocated: number;
  peak_day: number | null;
  peak_utilization_percent: number;
}

/** Ответ GET /events/{id}/resources/utilization (ResourceUtilizationResponse). */
export interface ResourceUtilizationResponse {
  event_id: string;
  horizon_days: number;
  resources: ResourceUtilization[];
}

/* ================================ Финансы ================================ */

/** Схема создания расхода (ExpenseCreate). */
export interface ExpenseCreate {
  category: string;
  /** Decimal → строка, > 0. */
  amount: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  description?: string;
}

/** Ответ с данными расхода (ExpenseResponse). */
export interface Expense {
  id: string;
  event_id: string;
  category: string;
  amount: string;
  date: string;
  description: string | null;
}

/** Сводка бюджета события (BudgetSummaryResponse). */
export interface BudgetSummaryResponse {
  event_id: string;
  total_budget: string | null;
  total_expenses: string;
  remaining_budget: string | null;
  expenses_count: number;
}

/* ============================= Площадки и карта =========================== */

/** Схема создания площадки (VenueCreate). */
export interface VenueCreate {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
}

/** Ответ с данными площадки (VenueResponse). */
export interface Venue {
  id: string;
  event_id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

/** Центр карты: средняя широта и долгота (MapCenter). */
export interface MapCenter {
  latitude: number;
  longitude: number;
}

/** Ответ GET /events/{id}/map (MapResponse). */
export interface MapResponse {
  event_id: string;
  venues: Venue[];
  center: MapCenter | null;
}

/* =============================== Уведомления ============================== */

/** Ответ с данными уведомления (NotificationResponse). */
export interface NotificationItem {
  id: string;
  event_id: string;
  /** Строковое значение NotificationType ("task_overdue" | "info"). */
  type: string;
  message: string;
  is_read: boolean;
  created_at: string | null;
}

/** Алиас по имени схемы бэкенда (schemas/notification.py). */
export type NotificationResponse = NotificationItem;
