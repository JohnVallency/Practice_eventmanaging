/**
 * Страница создания события /events/new — форма в карточке с расширенными настройками.
 */

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { Field, useToast } from "../components/ui";
import { api } from "../services/api";
import { describeError } from "../services/errors";
import { useEventStore } from "../store/eventStore";
import type { Event } from "../types";

interface FormState {
  name: string;
  startDate: string;
  endDate: string;
  budget: string;
  status: string;
  description: string;
  location: string;
  organizerName: string;
  organizerContact: string;
  maxParticipants: string;
}

const INITIAL: FormState = { 
  name: "", 
  startDate: "", 
  endDate: "", 
  budget: "", 
  status: "draft",
  description: "",
  location: "",
  organizerName: "",
  organizerContact: "",
  maxParticipants: ""
};

interface ValidationErrors {
  name?: string;
  startDate?: string;
  endDate?: string;
  budget?: string;
  maxParticipants?: string;
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
  if (form.budget.trim() !== "" && (isNaN(Number(form.budget)) || Number(form.budget) < 0)) {
    errors.budget = "Бюджет должен быть неотрицательным числом";
  }
  if (form.maxParticipants.trim() !== "" && (isNaN(Number(form.maxParticipants)) || Number(form.maxParticipants) < 0)) {
    errors.maxParticipants = "Максимальное количество участников должно быть неотрицательным числом";
  }
  return errors;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "📝 Черновик" },
  { value: "active", label: "🔥 Активно" },
  { value: "completed", label: "✅ Завершено" },
  { value: "archived", label: "🗄️ Архив" },
];

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
      const message = describeError(err);
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

          <div className="field">
            <label className="field__label">Статус события</label>
            <select
              className="field__input"
              value={form.status}
              onChange={(e) => patch({ status: e.target.value })}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field field--textarea">
            <label className="field__label" htmlFor="description">Описание события</label>
            <textarea
              id="description"
              className="field__input"
              rows={4}
              placeholder="Расскажите подробнее о событии: цели, аудитория, ключевые моменты..."
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>

          <Field
            label="Место проведения"
            value={form.location}
            onChange={(e) => patch({ location: e.target.value })}
            placeholder="Например: Москва, Конгресс-центр Экспо"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field
              label="Организатор (имя)"
              value={form.organizerName}
              onChange={(e) => patch({ organizerName: e.target.value })}
              placeholder="Имя контактного лица"
            />
            <Field
              label="Контакты организатора"
              value={form.organizerContact}
              onChange={(e) => patch({ organizerContact: e.target.value })}
              placeholder="Email или телефон"
            />
          </div>

          <Field
            label="Максимальное количество участников"
            type="number"
            min="0"
            step="1"
            value={form.maxParticipants}
            onChange={(e) => patch({ maxParticipants: e.target.value })}
            hint="Оставьте пустым, если ограничений нет"
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

      <div className="hint-panel">
        <p>
          Даты задают границы проекта — все планы внутри считаются в днях от начала. Бюджет нужен
          странице «Финансы»: остаток = бюджет − расходы.
        </p>
      </div>
    </section>
  );
}
