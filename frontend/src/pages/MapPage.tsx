/**
 * Страница карты площадок /events/:id/map.
 * Список площадок + центр масс (center из MapResponse).
 * DELETE площадок бэкенд не поддерживает — кнопок удаления нет.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { EmptyState, Field, Modal, Skeleton, useToast } from "../components/ui";
import { api } from "../services/api";
import { describeError } from "../services/errors";
import type { Venue } from "../types";

interface VenueFormState {
  name: string;
  address: string;
  latitude: string;
  longitude: string;
}

const EMPTY_FORM: VenueFormState = { name: "", address: "", latitude: "", longitude: "" };

interface ValidationErrors {
  name?: string;
  latitude?: string;
  longitude?: string;
}

function formatCoord(value: number): string {
  return value.toFixed(6);
}

function validate(form: VenueFormState): ValidationErrors {
  const errors: ValidationErrors = {};
  if (form.name.trim() === "") {
    errors.name = "Введите название площадки";
  }
  const lat = Number(form.latitude);
  if (form.latitude.trim() === "" || Number.isNaN(lat) || lat < -90 || lat > 90) {
    errors.latitude = "Широта: число от -90 до 90";
  }
  const lon = Number(form.longitude);
  if (form.longitude.trim() === "" || Number.isNaN(lon) || lon < -180 || lon > 180) {
    errors.longitude = "Долгота: число от -180 до 180";
  }
  return errors;
}

export default function MapPage() {
  const { id } = useParams<{ id: string }>();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<VenueFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const toast = useToast();

  const load = useCallback(
    async (eventId: string): Promise<void> => {
      setLoading(true);
      try {
        const data = await api.venues.map(eventId);
        setVenues(data.venues);
        setCenter(data.center);
        setError(null);
      } catch (err: unknown) {
        const message = describeError(err);
        setError(message);
        toast.push({ tone: "error", title: "Не удалось загрузить карту", message });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!id) {
      setError("Не указан идентификатор события.");
      setLoading(false);
      return;
    }
    void load(id);
  }, [id, load]);

  const patch = (part: Partial<VenueFormState>): void => {
    setForm((prev) => ({ ...prev, ...part }));
  };

  const handleCreate = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!id) return;
    const validation = validate(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      await api.venues.createVenue(id, {
        name: form.name.trim(),
        address: form.address.trim() === "" ? undefined : form.address.trim(),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      });
      toast.push({ tone: "ok", title: "Площадка добавлена" });
      setForm(EMPTY_FORM);
      setErrors({});
      setModalOpen(false);
      await load(id);
    } catch (err: unknown) {
      const message = describeError(err);
      toast.push({ tone: "error", title: "Не удалось добавить площадку", message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!id) {
    return (
      <section className="page">
        <EmptyState title="Событие не выбрано" hint="Не указан идентификатор события." />
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page__header">
        <h2 className="page__title">Карта площадок</h2>
        <button type="button" className="btn--primary" onClick={() => setModalOpen(true)}>
          Добавить площадку
        </button>
      </div>

      <div className="hint-panel" style={{ marginBottom: 16 }}>
        Площадки — точки на карте с координатами. <strong>«Центр масс»</strong> — среднее
        географическое по площадкам: удобно как отправная точка для поиска места.
      </div>

      {loading && (
        <div className="grid-cards">
          <div className="card">
            <Skeleton w="50%" h={20} />
            <Skeleton w="70%" h={16} />
          </div>
          <div className="card">
            <Skeleton w="50%" h={20} />
            <Skeleton w="70%" h={16} />
          </div>
        </div>
      )}

      {!loading && error !== null && <EmptyState title="Ошибка загрузки" hint={error} />}

      {!loading && error === null && venues.length === 0 && (
        <EmptyState
          title="Площадок пока нет"
          hint="Добавьте площадки, чтобы увидеть их на карте и центр масс."
          action={
            <button type="button" className="btn--primary" onClick={() => setModalOpen(true)}>
              Добавить площадку
            </button>
          }
        />
      )}

      {!loading && error === null && venues.length > 0 && (
        <div className="grid-cards">
          {center !== null && (
            <div className="card">
              <strong>Центр масс площадок</strong>
              <div className="muted">
                {formatCoord(center.latitude)}, {formatCoord(center.longitude)}
              </div>
            </div>
          )}
          {venues.map((venue) => (
            <div className="card" key={venue.id}>
              <strong>{venue.name}</strong>
              <div className="muted">{venue.address ?? "Адрес не указан"}</div>
              <div>
                {formatCoord(venue.latitude)}, {formatCoord(venue.longitude)}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Добавить площадку"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn--ghost"
              disabled={submitting}
              onClick={() => setModalOpen(false)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn--primary"
              disabled={submitting}
              onClick={() => {
                const formEl = document.getElementById("venue-form") as HTMLFormElement | null;
                formEl?.requestSubmit();
              }}
            >
              {submitting ? "Сохранение…" : "Добавить"}
            </button>
          </>
        }
      >
        <form id="venue-form" onSubmit={(e) => void handleCreate(e)} noValidate>
          <Field
            label="Название"
            required
            error={errors.name}
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Например: Главный зал"
          />
          <Field
            label="Адрес"
            value={form.address}
            onChange={(e) => patch({ address: e.target.value })}
            placeholder="Необязательно"
          />
          <Field
            label="Широта"
            type="number"
            required
            step="any"
            min="-90"
            max="90"
            error={errors.latitude}
            value={form.latitude}
            onChange={(e) => patch({ latitude: e.target.value })}
          />
          <Field
            label="Долгота"
            type="number"
            required
            step="any"
            min="-180"
            max="180"
            error={errors.longitude}
            value={form.longitude}
            onChange={(e) => patch({ longitude: e.target.value })}
          />
        </form>
      </Modal>
    </section>
  );
}
