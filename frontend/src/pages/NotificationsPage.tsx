/**
 * Страница уведомлений события /events/:id/notifications.
 * Только чтение: эндпоинтов отметки прочтения в бэкенде нет.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { Badge, EmptyState, Skeleton, useToast } from "../components/ui";
import { api } from "../services/api";
import { describeError } from "../services/errors";
import type { NotificationItem } from "../types";

function formatDateTime(value: string): string {
  const num = Date.parse(value);
  if (Number.isNaN(num)) return value;
  return new Date(num).toLocaleString("ru-RU");
}

export default function NotificationsPage() {
  const { id } = useParams<{ id: string }>();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toast = useToast();

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
        if (cancelled) return;
        const message = describeError(err);
        setError(message);
        toast.push({ tone: "error", title: "Не удалось загрузить уведомления", message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, toast]);

  if (loading) {
    return (
      <section className="page">
        <div className="page__header">
          <h2 className="page__title">Уведомления</h2>
        </div>
        <div className="card">
          <Skeleton w="30%" h={18} />
          <Skeleton w="80%" h={16} />
          <Skeleton w="45%" h={16} />
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page__header">
        <h2 className="page__title">Уведомления</h2>
      </div>

      {error !== null && <EmptyState title="Ошибка загрузки" hint={error} />}

      {error === null && notifications.length === 0 && (
        <EmptyState
          title="Уведомлений нет"
          hint="Уведомления появляются при расчёте расписания, если задача выходит за плановый срок"
        />
      )}

      {error === null && notifications.length > 0 && (
        <ul className="list">
          {notifications.map((notification) => {
            const isOverdue = notification.type === "task_overdue";
            return (
              <li key={notification.id} className="list__item">
                <div className="toolbar">
                  <Badge tone={isOverdue ? "critical" : "muted"}>
                    {isOverdue ? "Просрочка" : "Инфо"}
                  </Badge>
                  {!notification.is_read && <Badge tone="warn">Новое</Badge>}
                </div>
                <div>{notification.message}</div>
                <div className="muted">
                  {notification.created_at !== null
                    ? formatDateTime(notification.created_at)
                    : "—"}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
