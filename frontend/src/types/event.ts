/**
 * Контракты событий — зеркала backend/schemas/event.py.
 * UUID в JSON — строки, Decimal — строки, datetime — ISO-строки.
 */

/** Статус события — models/enums.py EventStatus. */
export type EventStatus = "draft" | "active" | "completed" | "archived";

/** Схема создания события (EventCreate). */
export interface EventCreate {
  name: string;
  description?: string;
  /** ISO datetime; end_date должен быть позже start_date. */
  start_date: string;
  end_date: string;
  timezone?: string;
  venue_name?: string | null;
  venue_address?: string | null;
  venue_room?: string | null;
  online_url?: string | null;
  organizer_name?: string | null;
  organizer_contact?: string | null;
  max_participants?: number | null;
  color?: string;
  status?: EventStatus;
  /** Decimal → строка, по умолчанию "0". */
  total_budget?: string;
}

/** Схема частичного обновления события (EventUpdate). */
export interface EventUpdate {
  name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  timezone?: string;
  venue_name?: string | null;
  venue_address?: string | null;
  venue_room?: string | null;
  online_url?: string | null;
  organizer_name?: string | null;
  organizer_contact?: string | null;
  max_participants?: number | null;
  color?: string;
  status?: EventStatus;
  total_budget?: string;
}

/** Ответ с данными события (EventResponse). Поля description в схеме нет. */
export interface Event {
  id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  timezone: string;
  venue_name: string | null;
  venue_address: string | null;
  venue_room: string | null;
  online_url: string | null;
  organizer_name: string | null;
  organizer_contact: string | null;
  max_participants: number | null;
  color: string;
  status: EventStatus;
  total_budget: string;
  created_at: string;
  updated_at: string;
}
