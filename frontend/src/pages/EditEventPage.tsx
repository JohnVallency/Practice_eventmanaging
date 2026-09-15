/**
 * Страница редактирования события /events/:id/edit — форма + смена статуса + удаление.
 */

import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Field, Modal, Skeleton, useToast } from "../components/ui";
import { api } from "../services/api";
import { useEventStore } from "../store/eventStore";
import type { Event, EventStatus } from "../types";

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
  budget: string;
  status: EventStatus;
}

interface ValidationErrors {
  name?: string;
  endDate?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

function validate(form: FormState): ValidationErrors {
  const errors: ValidationErrors = {};
  if (form.name.trim() === "") {
    errors.name = "Введите название события";
  }
  if (form.startDate !== "" && form.endDate !== "" && form.endDate <= form.startDate) {
    errors.endDate = "Дата окончания должна быть позже даты начала";
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
          budget: data.total_budget,
          status: data.status,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err));
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
        start_date: `${form.startDate}T00:00:00Z`,
        end_date: `${form.endDate}T00:00:00Z`,
        status: form.status,
        total_budget:
          form.budget.trim() === "" ? "0.00" : Number(form.budget).toFixed(2),
      });
      setEvent(updated);
      setCurrentEvent(updated);
      toast.push({ tone: "ok", title: "Изменения сохранены" });
      navigate(`/events/${updated.id}`);
    } catch (err: unknown) {
      const message = errorMessage(err);
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
      const message = errorMessage(err);
      setConfirmOpen(false);
      toast.push({ tone: "error", title: "Не удалось удалить событие", message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="page">
      <div className="page__header">
        <h2 className="page__title">Редактирование события</h2>
      </div>

      <div className="card">
        <form onSubmit={(e) => void handleSave(e)} noValidate>
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
        <p>
          Удалить событие «{form.name}»? Задачи, расходы и площадки будут удалены вместе с ним.
        </p>
      </Modal>
    </section>
  );
}
