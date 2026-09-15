/**
 * Страница создания события /events/new — форма в карточке.
 */

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { Field, useToast } from "../components/ui";
import { api } from "../services/api";
import { useEventStore } from "../store/eventStore";
import type { Event } from "../types";

interface FormState {
  name: string;
  startDate: string;
  endDate: string;
  budget: string;
}

const INITIAL: FormState = { name: "", startDate: "", endDate: "", budget: "" };

interface ValidationErrors {
  name?: string;
  startDate?: string;
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
  if (form.startDate === "") {
    errors.startDate = "Укажите дату начала";
  }
  if (form.endDate === "") {
    errors.endDate = "Укажите дату окончания";
  } else if (form.startDate !== "" && form.endDate <= form.startDate) {
    errors.endDate = "Дата окончания должна быть позже даты начала";
  }
  return errors;
}

export default function CreateEventPage() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();
  const setCurrentEvent = useEventStore((state) => state.setCurrentEvent);
  const toast = useToast();

  const patch = (part: Partial<FormState>): void => {
    setForm((prev) => ({ ...prev, ...part }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const validation = validate(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const created: Event = await api.events.create({
        name: form.name.trim(),
        start_date: `${form.startDate}T00:00:00Z`,
        end_date: `${form.endDate}T00:00:00Z`,
        total_budget:
          form.budget.trim() === "" ? "0.00" : Number(form.budget).toFixed(2),
      });
      toast.push({ tone: "ok", title: "Событие создано" });
      setCurrentEvent(created);
      navigate(`/events/${created.id}`);
    } catch (err: unknown) {
      const message = errorMessage(err);
      setServerError(message);
      toast.push({ tone: "error", title: "Не удалось создать событие", message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="page">
      <div className="page__header">
        <h2 className="page__title">Создать событие</h2>
      </div>

      <div className="card">
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <Field
            label="Название"
            required
            error={errors.name}
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Например: Конференция DevSum 2026"
          />
          <Field
            label="Дата начала"
            type="date"
            required
            error={errors.startDate}
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
            hint="Необязательно. По умолчанию 0.00"
            value={form.budget}
            onChange={(e) => patch({ budget: e.target.value })}
          />

          {serverError && <p className="danger-text">{serverError}</p>}

          <div className="toolbar">
            <button type="submit" className="btn--primary" disabled={submitting}>
              {submitting ? "Сохранение…" : "Создать событие"}
            </button>
            <button
              type="button"
              className="btn--ghost"
              disabled={submitting}
              onClick={() => navigate("/events")}
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
