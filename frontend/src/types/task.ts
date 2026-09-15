/**
 * Контракты задач и зависимостей — зеркала backend/schemas/task.py
 * и backend/schemas/task_dependency.py.
 */

/** Схема создания задачи (TaskCreate). */
export interface TaskCreate {
  event_id: string;
  name: string;
  duration_days: number;
}

/** Схема частичного обновления задачи (TaskUpdate). */
export interface TaskUpdate {
  name?: string;
  duration_days?: number;
}

/** Ответ с данными задачи (TaskResponse). Полей status/description в схеме нет. */
export interface Task {
  id: string;
  event_id: string;
  name: string;
  duration_days: number;
  earliest_start: number | null;
  earliest_finish: number | null;
  latest_start: number | null;
  latest_finish: number | null;
  total_float: number | null;
  free_float: number | null;
  actual_start: number | null;
  actual_finish: number | null;
  is_critical: boolean;
  created_at: string;
}

/** Тип связи задач — models/enums.py DependencyType. */
export type DependencyType = "FS" | "SS" | "FF" | "SF";

/** Схема создания связи (TaskDependencyCreate). */
export interface TaskDependencyCreate {
  predecessor_id: string;
  /** Должен совпадать с задачей из пути запроса POST /tasks/{task_id}/dependencies. */
  successor_id: string;
  dependency_type?: DependencyType;
  lag_days?: number;
}

/** Ответ со связью задач (TaskDependencyResponse). Составной PK — поля id нет. */
export interface TaskDependency {
  predecessor_id: string;
  successor_id: string;
  dependency_type: DependencyType;
  lag_days: number;
}
