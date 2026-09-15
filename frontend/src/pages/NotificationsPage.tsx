/**
 * Страница уведомлений события /events/:id/notifications.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../services/api";
import type { NotificationResponse } from "../types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU");
}

export default function NotificationsPage() {
  const { id } = useParams<{ id: string }>();
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Не указан идентификатор события.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    api.notifications
      .list(id)
      .then((data) => {
        if (!cancelled) setNotifications(data);
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
  }, [id]);

  return (
    <section className="page">
      <h2 className="page__title">Уведомления</h2>
      {error && <p className="alert">{error}</p>}
      {loading && <p className="muted">Загрузка…</p>}
      {!loading && !error && notifications.length === 0 && <p className="muted">Уведомлений нет.</p>}
      {!loading && !error && notifications.length > 0 && (
        <ul className="list">
          {notifications.map((notification) => (
            <li key={String(notification.id)} className="list__item">
              <div className="notifications__header">
                <span className="badge">{notification.type}</span>
                {!notification.is_read && <span className="badge badge--unread">Новое</span>}
              </div>
              <div>{notification.message}</div>
              <div className="muted">
                {notification.created_at
                  ? formatDateTime(notification.created_at)
                  : "время не указано"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
