/**
 * Контракты ресурсов и назначений — зеркала backend/schemas/resource.py
 * и backend/schemas/assignment.py.
 */

/** Тип ресурса — models/enums.py ResourceType. */
export type ResourceType = "human" | "equipment" | "venue";

/** Схема создания ресурса (ResourceCreate). */
export interface ResourceCreate {
  event_id: string;
  name: string;
  type: ResourceType;
  /** Decimal → строка, > 0. */
  availability_per_day: string;
  /** Decimal → строка, >= 0. */
  cost_per_day: string;
}

/** Схема частичного обновления ресурса (ResourceUpdate). */
export interface ResourceUpdate {
  name?: string;
  type?: ResourceType;
  availability_per_day?: string;
  cost_per_day?: string;
}

/** Ответ с данными ресурса (ResourceResponse). */
export interface Resource {
  id: string;
  event_id: string;
  name: string;
  type: ResourceType;
  availability_per_day: string;
  cost_per_day: string;
  created_at: string;
}

/** Схема создания назначения (AssignmentCreate). */
export interface AssignmentCreate {
  task_id: string;
  resource_id: string;
  /** Decimal → строка, > 0. */
  units_allocated: string;
}

/** Схема частичного обновления назначения (AssignmentUpdate). */
export interface AssignmentUpdate {
  units_allocated?: string;
}

/** Ответ с данными назначения (AssignmentResponse). */
export interface Assignment {
  id: string;
  task_id: string;
  resource_id: string;
  units_allocated: string;
  created_at: string;
}
