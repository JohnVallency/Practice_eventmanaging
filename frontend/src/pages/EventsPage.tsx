/**
 * Страница списка событий /events — сетка карточек с пагинацией.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge, Button, EmptyState, Skeleton, useToast } from "../components/ui";
import { api } from "../services/api";
import { describeError } from "../services/errors";
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

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const countsCancelled = useRef(false);
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
        const message = describeError(err);
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

  // Счётчики задач для карточек — фоновые запросы; при ошибке строка просто скрывается.
  const requestedIds = useRef<Set<string>>(new Set());

  const refreshCounts = useCallback((list: Event[]): void => {
    for (const item of list) {
      if (requestedIds.current.has(item.id)) continue;
      requestedIds.current.add(item.id);
      void api.tasks
        .listAll(item.id)
        .then((tasks) => {
          if (countsCancelled.current) return;
          setTaskCounts((prev) => ({ ...prev, [item.id]: tasks.length }));
        })
        .catch(() => {
          // Ошибка счётчика не влияет на страницу — строка «N задач» не показывается.
        });
    }
  }, []);

  useEffect(() => {
    return () => {
      countsCancelled.current = true;
    };
  }, []);

  useEffect(() => {
    if (!loading && error === null && events.length > 0) {
      refreshCounts(events);
    }
  }, [events, loading, error, refreshCounts]);

  return (
    <section className="page">
      <div className="page__header events-page-header">
        <div><div className="eyebrow">Workspace / events</div><h2 className="page__title">События</h2><p className="events-page-header__sub">Проекты, расписание и площадки в одном рабочем пространстве.</p></div>
        <Button variant="primary" onClick={() => navigate("/events/new")}>Создать событие</Button>
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
          hint="Событие — это проект: праздник, конференция, ремонт. Создайте первое — внутри появятся задачи, ресурсы, бюджет."
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
                className="event-tile"
                onClick={() => openEvent(event)}
              >
                <div className="event-tile__accent" style={{ background: event.color }} />
                <div className="event-tile__top">
                  <span className="event-tile__label">Event workspace</span>
                  <Badge tone={STATUS_TONES[event.status]}>{STATUS_LABELS[event.status]}</Badge>
                </div>
                <strong className="event-tile__title">{event.name}</strong>
                <div className="event-tile__schedule"><span>{formatDate(event.start_date)}</span><b>{formatTime(event.start_date)}</b><i>→</i><span>{formatDate(event.end_date)}</span><b>{formatTime(event.end_date)}</b></div>
                <div className="event-tile__venue"><span>{event.venue_name || "Площадка не указана"}</span>{event.venue_room && <small>{event.venue_room}</small>}</div>
                <div className="event-tile__footer"><span>{taskCounts[event.id] !== undefined ? `${taskCounts[event.id]} задач` : "Задачи загружаются"}</span><span>{formatMoney(event.total_budget)}</span></div>
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
