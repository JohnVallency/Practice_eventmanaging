/**
 * Страница карточки события /events/:id.
 */

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, ApiError } from "../services/api";
import { useEventStore } from "../store/eventStore";
import type { Event } from "../types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setCurrentEvent = useEventStore((state) => state.setCurrentEvent);

  useEffect(() => {
    if (!id) {
      setError("Не указан идентификатор события.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    api.events
      .get(id)
      .then((data) => {
        if (cancelled) return;
        setEvent(data);
        setCurrentEvent(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404 ? "Событие не найдено" : errorMessage(err),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, setCurrentEvent]);

  return (
    <section className="page">
      <h2 className="page__title">Событие</h2>
      {error && <p className="alert">{error}</p>}
      {loading && <p className="muted">Загрузка…</p>}
      {!loading && !error && event && (
        <div className="card">
          <dl className="card__fields">
            <div>
              <dt>Название</dt>
              <dd>{event.name}</dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>{event.status}</dd>
            </div>
            <div>
              <dt>Начало</dt>
              <dd>{formatDate(event.start_date)}</dd>
            </div>
            <div>
              <dt>Окончание</dt>
              <dd>{formatDate(event.end_date)}</dd>
            </div>
            <div>
              <dt>Общий бюджет</dt>
              <dd>{event.total_budget ?? "—"}</dd>
            </div>
          </dl>
          <div className="actions">
            <Link className="button" to={`/events/${event.id}/tasks`}>
              Задачи
            </Link>
            <Link className="button" to={`/events/${event.id}/schedule`}>
              Расписание
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
