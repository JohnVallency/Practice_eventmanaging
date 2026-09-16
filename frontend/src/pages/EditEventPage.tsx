/**
 * Страница редактирования события /events/:id/edit — форма + смена статуса + удаление.
 */

import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Field, Modal, Skeleton, useToast } from "../components/ui";
import { api } from "../services/api";
import { describeError } from "../services/errors";
import { useEventStore } from "../store/eventStore";
import type { Event, EventStatus } from "../types";
import { zonedLocalToIso } from "../utils/date";

const STATUS_OPTIONS: Array<{ value: EventStatus; label: string }> = [
  { value: "draft", label: "Черновик" },
  { value: "active", label: "В работе" },
  { value: "completed", label: "Завершён" },
  { value: "archived", label: "Архив" },
];

interface FormState {
  name: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  budget: string;
  status: EventStatus;
  description: string;
  venueName: string;
  venueAddress: string;
  venueRoom: string;
  onlineUrl: string;
  organizerName: string;
  organizerContact: string;
  maxParticipants: string;
  color: string;
}

interface ValidationErrors {
  name?: string;
  endDate?: string;
  maxParticipants?: string;
}

function validate(form: FormState): ValidationErrors {
  const errors: ValidationErrors = {};
  if (form.name.trim() === "") {
    errors.name = "Введите название события";
  }
  if (form.startDate !== "" && form.endDate !== "" && `${form.endDate}T${form.endTime}` <= `${form.startDate}T${form.startTime}`) {
    errors.endDate = "Дата окончания должна быть позже даты начала";
  }
  if (form.maxParticipants.trim() !== "" && (Number.isNaN(Number(form.maxParticipants)) || Number(form.maxParticipants) < 1)) {
    errors.maxParticipants = "Максимальное количество участников должно быть не меньше 1";
  }
  return errors;
}

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const navigate = useNavigate();
  const setCurrentEvent = useEventStore((state) => state.setCurrentEvent);
  const clearCurrentEvent = useEventStore((state) => state.clearCurrentEvent);
  const toast = useToast();

  useEffect(() => {
    if (!id) {
      setLoadError("Не указан идентификатор события.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    api.events
      .get(id)
      .then((data) => {
        if (cancelled) return;
        setEvent(data);
        setForm({
          name: data.name,
          startDate: data.start_date.slice(0, 10),
          endDate: data.end_date.slice(0, 10),
          startTime: data.start_date.slice(11, 16),
          endTime: data.end_date.slice(11, 16),
          timezone: data.timezone ?? "Europe/Moscow",
          budget: data.total_budget,
          status: data.status,
          description: data.description ?? "",
          venueName: data.venue_name ?? "",
          venueAddress: data.venue_address ?? "",
          venueRoom: data.venue_room ?? "",
          onlineUrl: data.online_url ?? "",
          organizerName: data.organizer_name ?? "",
          organizerContact: data.organizer_contact ?? "",
          maxParticipants: data.max_participants ? String(data.max_participants) : "",
          color: data.color ?? "#E1A24A",
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(describeError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (form === null) {
    return (
      <section className="page">
        <div className="page__header">
          <h2 className="page__title">Редактирование события</h2>
        </div>
        {loading && (
          <div className="card">
            <Skeleton w="50%" h={20} />
            <Skeleton w="80%" h={20} />
            <Skeleton w="65%" h={20} />
          </div>
        )}
        {!loading && loadError && (
          <p className="danger-text">{loadError}</p>
        )}
      </section>
    );
  }

  const patch = (part: Partial<FormState>): void => {
    setForm((prev) => (prev === null ? prev : { ...prev, ...part }));
  };

  const handleSave = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (event === null || id === undefined) return;
    const validation = validate(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setServerError(null);
    try {
      const updated = await api.events.update(id, {
        name: form.name.trim(),
        start_date: zonedLocalToIso(`${form.startDate}T${form.startTime}`, form.timezone),
        end_date: zonedLocalToIso(`${form.endDate}T${form.endTime}`, form.timezone),
        description: form.description,
        timezone: form.timezone,
        venue_name: form.venueName || null,
        venue_address: form.venueAddress || null,
        venue_room: form.venueRoom || null,
        online_url: form.onlineUrl || null,
        organizer_name: form.organizerName || null,
        organizer_contact: form.organizerContact || null,
        max_participants: form.maxParticipants ? Number(form.maxParticipants) : null,
        color: form.color,
        status: form.status,
        total_budget:
          form.budget.trim() === "" ? "0.00" : Number(form.budget).toFixed(2),
      });
      setEvent(updated);
      setCurrentEvent(updated);
      toast.push({ tone: "ok", title: "Изменения сохранены" });
      navigate(`/events/${updated.id}`);
    } catch (err: unknown) {
      const message = describeError(err);
      setServerError(message);
      toast.push({ tone: "error", title: "Не удалось сохранить изменения", message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (event === null || id === undefined) return;
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

  return (
    <section className="page">
      <div className="page__header">
        <div><div className="eyebrow">Event settings</div><h2 className="page__title">Настроить событие</h2><p className="event-config-subtitle">Обновите расписание, площадку и параметры команды.</p></div>
      </div>

      <div className="event-config-card">
        <div className="event-config-card__head"><div><strong>Конфигурация события</strong><span>Изменения сохраняются в рабочем плане и календаре.</span></div><span className="event-config-card__step">01 / 03</span></div>
        <form onSubmit={(e) => void handleSave(e)} noValidate>
          <div className="event-form-section-title event-form-section-title--first">Расписание и бюджет</div>
          <Field
            label="Название"
            required
            error={errors.name}
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <Field
            label="Дата начала"
            type="date"
            required
            value={form.startDate}
            onChange={(e) => patch({ startDate: e.target.value })}
          />
          <div className="event-form-grid event-form-grid--schedule"><Field label="Время начала" type="time" required value={form.startTime} onChange={(e) => patch({ startTime: e.target.value })} /><Field label="Время окончания" type="time" required value={form.endTime} onChange={(e) => patch({ endTime: e.target.value })} /></div>
          <Field
            label="Дата окончания"
            type="date"
            required
            error={errors.endDate}
            value={form.endDate}
            onChange={(e) => patch({ endDate: e.target.value })}
          />
          <Field
            label="Общий бюджет"
            type="number"
            step="0.01"
            min="0"
            hint="Пусто — бюджет 0.00"
            value={form.budget}
            onChange={(e) => patch({ budget: e.target.value })}
          />

          <Field label="Статус">
            <select
              value={form.status}
              onChange={(e) => patch({ status: e.target.value as EventStatus })}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Часовой пояс" value={form.timezone} onChange={(e) => patch({ timezone: e.target.value })} />
          <div className="field field--textarea"><label className="field__label" htmlFor="event-description">Описание события</label><textarea id="event-description" className="field__input" rows={4} value={form.description} onChange={(e) => patch({ description: e.target.value })} /></div>
          <div className="event-form-section-title">Площадка и доступ</div>
          <div className="event-form-grid"><Field label="Площадка" value={form.venueName} onChange={(e) => patch({ venueName: e.target.value })} /><Field label="Зал / аудитория" value={form.venueRoom} onChange={(e) => patch({ venueRoom: e.target.value })} /></div>
          <Field label="Адрес площадки" value={form.venueAddress} onChange={(e) => patch({ venueAddress: e.target.value })} />
          <Field label="Онлайн-ссылка" type="url" value={form.onlineUrl} onChange={(e) => patch({ onlineUrl: e.target.value })} />
          <div className="event-form-section-title">Организация</div>
          <div className="event-form-grid"><Field label="Ответственный" value={form.organizerName} onChange={(e) => patch({ organizerName: e.target.value })} /><Field label="Контакт" value={form.organizerContact} onChange={(e) => patch({ organizerContact: e.target.value })} /></div>
          <div className="event-form-grid"><Field label="Лимит участников" type="number" min="1" error={errors.maxParticipants} value={form.maxParticipants} onChange={(e) => patch({ maxParticipants: e.target.value })} /><Field label="Цвет события" type="color" value={form.color} onChange={(e) => patch({ color: e.target.value })} /></div>

          {serverError && <p className="danger-text">{serverError}</p>}

          <div className="toolbar">
            <button type="submit" className="btn--primary" disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
            <button
              type="button"
              className="btn--ghost"
              disabled={saving}
              onClick={() => navigate(`/events/${id}`)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn--danger"
              disabled={deleting}
              onClick={() => setConfirmOpen(true)}
            >
              Удалить событие
            </button>
          </div>
        </form>
      </div>

      <div className="hint-panel">
        <p>
          Даты задают границы проекта — все планы внутри считаются в днях от начала. Бюджет нужен
          странице «Финансы»: остаток = бюджет − расходы.
        </p>
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
        <p>Удалить событие «{form.name}»?</p>
        <p className="muted">
          Будут удалены вместе с событием: задачи и их связи, ресурсы и назначения, расходы,
          площадки, уведомления.
        </p>
      </Modal>
    </section>
  );
}
