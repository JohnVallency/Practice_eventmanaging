/**
 * Страница списка событий /events — сетка карточек с пагинацией.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge, EmptyState, Skeleton, useToast } from "../components/ui";
import { api } from "../services/api";
import { useEventStore } from "../store/eventStore";
import type { Event, EventStatus } from "../types";

const PAGE_SIZE = 10;

/** Русские метки статусов события. */
const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Черновик",
  active: "В работе",
  completed: "Завершён",
  archived: "Архив",
};

/** Тон бейджа статуса события. */
const STATUS_TONES: Record<EventStatus, "critical" | "ok" | "warn" | "muted"> = {
  draft: "muted",
  active: "ok",
  completed: "warn",
  archived: "muted",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

function formatMoney(value: string): string {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `${num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function formatDate(value: string): string {
  const num = Date.parse(value);
  if (Number.isNaN(num)) return value.slice(0, 10);
  return new Date(num).toLocaleDateString("ru-RU");
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const navigate = useNavigate();
  const setCurrentEvent = useEventStore((state) => state.setCurrentEvent);
  const toast = useToast();

  const load = useCallback(
    async (nextSkip: number, append: boolean): Promise<void> => {
      if (append) setLoadingMore(true);
      try {
        const data = await api.events.list({ skip: nextSkip, limit: PAGE_SIZE });
        setEvents((prev) => (append ? [...prev, ...data] : data));
        setSkip(nextSkip);
        setHasMore(data.length === PAGE_SIZE);
        setError(null);
      } catch (err: unknown) {
        const message = errorMessage(err);
        setError(message);
        toast.push({ tone: "error", title: "Не удалось загрузить события", message });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load(0, false).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const openEvent = (event: Event): void => {
    setCurrentEvent(event);
    navigate(`/events/${event.id}`);
  };

  return (
    <section className="page">
      <div className="page__header">
        <h2 className="page__title">События</h2>
        <button type="button" className="btn--primary" onClick={() => navigate("/events/new")}>
          Создать событие
        </button>
      </div>

      {loading && (
        <div className="grid-cards">
          {Array.from({ length: 4 }, (_, i) => (
            <div className="card" key={i}>
              <Skeleton w="60%" h={22} />
              <Skeleton w="40%" h={16} />
              <Skeleton w="80%" h={16} />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <EmptyState
          title="Событий пока нет"
          hint="Создайте первое событие, чтобы начать планирование."
          action={
            <button type="button" className="btn--primary" onClick={() => navigate("/events/new")}>
              Создать событие
            </button>
          }
        />
      )}

      {!loading && error === null && events.length > 0 && (
        <>
          <div className="grid-cards">
            {events.map((event) => (
              <button
                type="button"
                key={event.id}
                className="card"
                onClick={() => openEvent(event)}
              >
                <div>
                  <strong>{event.name}</strong>{" "}
                  <Badge tone={STATUS_TONES[event.status]}>{STATUS_LABELS[event.status]}</Badge>
                </div>
                <div className="muted">
                  {formatDate(event.start_date)} — {formatDate(event.end_date)}
                </div>
                <div>Бюджет: {formatMoney(event.total_budget)}</div>
                <div className="muted">Создано: {formatDate(event.created_at)}</div>
              </button>
            ))}
          </div>

          {hasMore && (
            <div className="toolbar">
              <button
                type="button"
                className="btn--ghost"
                disabled={loadingMore}
                onClick={() => void load(skip + PAGE_SIZE, true)}
              >
                {loadingMore ? "Загрузка…" : "Показать ещё"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
