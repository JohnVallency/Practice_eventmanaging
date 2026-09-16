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
import { zonedLocalToIso } from "../utils/date";

interface FormState {
  name: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  budget: string;
  status: string;
  description: string;
  location: string;
  venueAddress: string;
  venueRoom: string;
  onlineUrl: string;
  organizerName: string;
  organizerContact: string;
  maxParticipants: string;
  color: string;
}

const INITIAL: FormState = {
  name: "", 
  startDate: "", 
  endDate: "", 
  startTime: "09:00",
  endTime: "18:00",
  timezone: "Europe/Moscow",
  budget: "", 
  status: "draft",
  description: "",
  location: "",
  venueAddress: "",
  venueRoom: "",
  onlineUrl: "",
  organizerName: "",
  organizerContact: "",
  maxParticipants: "",
  color: "#E1A24A",
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
  if (form.startTime === "" || form.endTime === "") errors.endDate = "Укажите время начала и окончания";
  if (form.endDate === "") {
    errors.endDate = "Укажите дату окончания";
  } else if (form.startDate !== "" && `${form.endDate}T${form.endTime}` <= `${form.startDate}T${form.startTime}`) {
    errors.endDate = "Дата окончания должна быть позже даты начала";
  }
  if (form.budget.trim() !== "" && (isNaN(Number(form.budget)) || Number(form.budget) < 0)) {
    errors.budget = "Бюджет должен быть неотрицательным числом";
  }
  if (form.maxParticipants.trim() !== "" && (isNaN(Number(form.maxParticipants)) || Number(form.maxParticipants) < 1)) {
    errors.maxParticipants = "Максимальное количество участников должно быть не меньше 1";
  }
  return errors;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Черновик" },
  { value: "active", label: "В работе" },
  { value: "completed", label: "Завершено" },
  { value: "archived", label: "Архив" },
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
        start_date: zonedLocalToIso(`${form.startDate}T${form.startTime}`, form.timezone),
        end_date: zonedLocalToIso(`${form.endDate}T${form.endTime}`, form.timezone),
        description: form.description,
        status: form.status as "draft" | "active" | "completed" | "archived",
        timezone: form.timezone,
        venue_name: form.location || null,
        venue_address: form.venueAddress || null,
        venue_room: form.venueRoom || null,
        online_url: form.onlineUrl || null,
        organizer_name: form.organizerName || null,
        organizer_contact: form.organizerContact || null,
        max_participants: form.maxParticipants ? Number(form.maxParticipants) : null,
        color: form.color,
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
        <div><div className="eyebrow">New workspace</div><h2 className="page__title">Создать событие</h2><p className="event-config-subtitle">Соберите базу проекта: расписание, площадку и команду.</p></div>
      </div>

      <div className="event-config-card">
        <div className="event-config-card__head"><div><strong>Основные настройки</strong><span>Сначала задайте рамки события, затем добавьте детали.</span></div><span className="event-config-card__step">01 / 03</span></div>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="event-form-section-title event-form-section-title--first">Расписание и бюджет</div>
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
          <div className="event-form-grid event-form-grid--schedule">
          <Field
            label="Время начала"
            type="time"
            required
            value={form.startTime}
            onChange={(e) => patch({ startTime: e.target.value })}
          />
          <Field
            label="Время окончания"
            type="time"
            required
            value={form.endTime}
            onChange={(e) => patch({ endTime: e.target.value })}
          />
          </div>
          <Field
            label="Дата окончания"
            type="date"
            required
            error={errors.endDate}
            value={form.endDate}
            onChange={(e) => patch({ endDate: e.target.value })}
          />
          <Field label="Часовой пояс" value={form.timezone} onChange={(e) => patch({ timezone: e.target.value })} placeholder="Например: Europe/Moscow" />
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
          <Field label="Адрес площадки" value={form.venueAddress} onChange={(e) => patch({ venueAddress: e.target.value })} placeholder="Улица, дом, город" />
          <div className="event-form-grid"><Field label="Зал / аудитория" value={form.venueRoom} onChange={(e) => patch({ venueRoom: e.target.value })} placeholder="Зал 3, сцена A" /><Field label="Онлайн-ссылка" type="url" value={form.onlineUrl} onChange={(e) => patch({ onlineUrl: e.target.value })} placeholder="https://..." /></div>

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
            error={errors.maxParticipants}
            value={form.maxParticipants}
            onChange={(e) => patch({ maxParticipants: e.target.value })}
            hint="Оставьте пустым, если ограничений нет"
          />
          <div className="event-form-grid"><Field label="Цвет события" type="color" value={form.color} onChange={(e) => patch({ color: e.target.value })} /><div className="event-form-note">Используется в календаре, карточках и рабочей навигации.</div></div>

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
