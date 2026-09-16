/**
 * Страница карточки события /events/:id — поля, смена статуса, статистика.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiCalendar, FiMapPin, FiMonitor, FiUser } from "react-icons/fi";

import { Badge, EmptyState, Modal, Skeleton, useToast } from "../components/ui";
import { api, ApiError } from "../services/api";
import { describeError } from "../services/errors";
import { useEventStore } from "../store/eventStore";
import type { BudgetSummaryResponse, Event, EventStatus } from "../types";

const STATUS_OPTIONS: Array<{ value: EventStatus; label: string }> = [
  { value: "draft", label: "Черновик" },
  { value: "active", label: "В работе" },
  { value: "completed", label: "Завершён" },
  { value: "archived", label: "Архив" },
];

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Черновик",
  active: "В работе",
  completed: "Завершён",
  archived: "Архив",
};

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

function formatDateTime(value: string, timezone: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString("ru-RU")} · ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} (${timezone})`;
}

interface Stats {
  taskCount: number | null;
  summary: BudgetSummaryResponse | null;
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ taskCount: null, summary: null });
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const navigate = useNavigate();
  const setCurrentEvent = useEventStore((state) => state.setCurrentEvent);
  const clearCurrentEvent = useEventStore((state) => state.clearCurrentEvent);
  const toast = useToast();

  useEffect(() => {
    if (!id) {
      setError("Не указан идентификатор события.");
      setLoading(false);
      return;
    }
    let cancelled = false;

    // Статистика — параллельно с загрузкой события; ошибки не ломают страницу.
    void api.tasks
      .list(id)
      .then((tasks) => {
        if (!cancelled) setStats((prev) => ({ ...prev, taskCount: tasks.length }));
      })
      .catch(() => {
        if (!cancelled) setStats((prev) => ({ ...prev, taskCount: null }));
      });

    void api.finances
      .budgetSummary(id)
      .then((data) => {
        if (!cancelled) setStats((prev) => ({ ...prev, summary: data }));
      })
      .catch(() => {
        if (!cancelled) setStats((prev) => ({ ...prev, summary: null }));
      });

    api.events
      .get(id)
      .then((data) => {
        if (cancelled) return;
        setEvent(data);
        setCurrentEvent(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          const message = describeError(err);
          setError(message);
          toast.push({ tone: "error", title: "Не удалось загрузить событие", message });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, setCurrentEvent, toast]);

  const handleStatusChange = async (status: EventStatus): Promise<void> => {
    if (id === undefined) return;
    try {
      const updated = await api.events.update(id, { status });
      setEvent(updated);
      setCurrentEvent(updated);
      toast.push({ tone: "ok", title: "Статус обновлён" });
    } catch (err: unknown) {
      const message = describeError(err);
      toast.push({ tone: "error", title: "Не удалось обновить статус", message });
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (id === undefined) return;
    setDeleting(true);
    try {
      await api.events.delete(id);
      toast.push({ tone: "ok", title: "Событие удалено" });
      clearCurrentEvent();
      navigate("/events");
    } catch (err: unknown) {
      const message = describeError(err);
      setConfirmOpen(false);
      toast.push({ tone: "error", title: "Не удалось удалить событие", message });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <section className="page">
        <div className="page__header">
          <h2 className="page__title">Событие</h2>
        </div>
        <div className="card">
          <Skeleton w="55%" h={24} />
          <Skeleton w="70%" h={18} />
          <Skeleton w="45%" h={18} />
        </div>
      </section>
    );
  }

  if (notFound || event === null) {
    return (
      <section className="page">
        <EmptyState
          title="Событие не найдено"
          hint={error ?? "Возможно, оно было удалено или ссылка устарела."}
          action={
            <button type="button" className="btn--primary" onClick={() => navigate("/events")}>
              К списку событий
            </button>
          }
        />
      </section>
    );
  }

  if (error !== null) {
    return (
      <section className="page">
        <EmptyState
          title="Ошибка загрузки"
          hint={error}
          action={
            <button type="button" className="btn--primary" onClick={() => navigate("/events")}>
              К списку событий
            </button>
          }
        />
      </section>
    );
  }

  const summary = stats.summary;
  const remaining =
    summary !== null && summary.remaining_budget !== null
      ? Number(summary.remaining_budget)
      : null;
  const overBudget = remaining !== null && remaining < 0;

  return (
    <section className="page">

      <div className="event-detail-hero" style={{ "--event-accent": event.color } as CSSProperties}>
      <div className="event-detail-hero__main">
        <div className="eyebrow">Event workspace</div>
        <h1>{event.name}</h1>
        <p>{event.description || "Добавьте описание, чтобы команда видела контекст и цель события."}</p>
      </div>
      <div className="event-detail-meta">
        <div><FiCalendar /><div><span>Период</span><strong>{formatDateTime(event.start_date, event.timezone)} — {formatDateTime(event.end_date, event.timezone)}</strong></div></div>
        <div><FiMapPin /><div><span>Площадка</span><strong>{event.venue_name || "Площадка не указана"}{event.venue_room ? ` · ${event.venue_room}` : ""}</strong>{event.venue_address && <span>{event.venue_address}</span>}</div></div>
        {event.online_url && <div><FiMonitor /><div><span>Онлайн</span><strong><a href={event.online_url} target="_blank" rel="noreferrer">Открыть подключение</a></strong></div></div>}
        {event.organizer_name && <div><FiUser /><div><span>Ответственный</span><strong>{event.organizer_name}</strong>{event.organizer_contact && <span>{event.organizer_contact}</span>}</div></div>}
      </div>
      </div>

      <div className="hint-panel" style={{ marginTop: 16 }}>
        <p>
          <strong>Событие</strong> — контейнер проекта: внутри задачи, зависимости, ресурсы и
          бюджет. Статус — метка для команды (Черновик → В работе → Завершён → Архив) и на расчёты
          не влияет. Поля «Раннее/Позднее начало» появятся на странице «План» после расчёта.
        </p>
      </div>

      <div className="card">
        <dl className="card__fields">
          <div>
            <dt>Название</dt>
            <dd>
              {event.name}{" "}
              <Badge tone={STATUS_TONES[event.status]}>{STATUS_LABELS[event.status]}</Badge>
            </dd>
          </div>
          <div>
            <dt>Начало</dt>
            <dd>{formatDateTime(event.start_date, event.timezone)}</dd>
          </div>
          <div>
            <dt>Окончание</dt>
            <dd>{formatDateTime(event.end_date, event.timezone)}</dd>
          </div>
          <div>
            <dt>Общий бюджет</dt>
            <dd>{formatMoney(event.total_budget)}</dd>
          </div>
          <div>
            <dt>Создано</dt>
            <dd>{formatDate(event.created_at)}</dd>
          </div>
          <div><dt>Участники</dt><dd>{event.max_participants ? `до ${event.max_participants}` : "без лимита"}</dd></div>
        </dl>

        <div className="field">
          <label className="field__label" htmlFor="event-status">
            Статус
          </label>
          <select
            id="event-status"
            value={event.status}
            onChange={(e) => void handleStatusChange(e.target.value as EventStatus)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar">
          <button
            type="button"
            className="btn--primary"
            onClick={() => navigate(`/events/${event.id}/edit`)}
          >
            Редактировать
          </button>
          <button
            type="button"
            className="btn--danger"
            disabled={deleting}
            onClick={() => setConfirmOpen(true)}
          >
            Удалить
          </button>
        </div>
      </div>

      <div className="grid-cards">
        <div className="card">
          <div className="stat-card__label">Задачи события</div>
          <div className="stat-card__value">
            {stats.taskCount === null ? "—" : String(stats.taskCount)}
          </div>
        </div>
        <div className="card">
          <div className="stat-card__label">Остаток бюджета</div>
          <div className={`stat-card__value${overBudget ? " stat-card__value--critical" : ""}`}>
            {remaining === null ? "—" : formatMoney(summary?.remaining_budget ?? "0")}
          </div>
          {summary !== null && summary.total_budget !== null && (
            <div className="progress">
              <div
                className={overBudget ? "progress__fill progress__fill--over" : "progress__fill"}
                  style={{
                  width: Number(summary.total_budget) > 0
                    ? `${Math.min(100, (Number(summary.total_expenses) / Number(summary.total_budget)) * 100)}%`
                    : "0%",
                }}
              />
            </div>
          )}
        </div>
      </div>

      <Modal
        open={confirmOpen}
        title="Удалить событие?"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn--ghost"
              disabled={deleting}
              onClick={() => setConfirmOpen(false)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn--danger"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? "Удаление…" : "Удалить"}
            </button>
          </>
        }
      >
        <p>Удалить событие «{event.name}»?</p>
        <p className="muted">
          Будут удалены вместе с событием: задачи и их связи, ресурсы и назначения, расходы,
          площадки, уведомления.
        </p>
      </Modal>
    </section>
  );
}
