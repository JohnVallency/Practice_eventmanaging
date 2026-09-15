/**
 * Страница списка событий /events.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../services/api";
import { useEventStore } from "../store/eventStore";
import type { Event } from "../types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setCurrentEvent = useEventStore((state) => state.setCurrentEvent);

  useEffect(() => {
    let cancelled = false;

    api.events
      .list()
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openEvent = (event: Event): void => {
    setCurrentEvent(event);
    navigate(`/events/${event.id}`);
  };

  return (
    <section className="page">
      <h2 className="page__title">События</h2>
      {error && <p className="alert">{error}</p>}
      {loading && <p className="muted">Загрузка…</p>}
      {!loading && !error && events.length === 0 && <p className="muted">Событий пока нет.</p>}
      {!loading && !error && events.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Статус</th>
              <th>Даты</th>
              <th>Бюджет</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={String(event.id)} className="table__row--click" onClick={() => openEvent(event)}>
                <td>{event.name}</td>
                <td>{event.status}</td>
                <td>
                  {formatDate(event.start_date)} — {formatDate(event.end_date)}
                </td>
                <td>{event.total_budget ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
