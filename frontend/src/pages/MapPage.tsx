/**
 * Страница карты площадок события /events/:id/map (без картографической библиотеки).
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../services/api";
import type { MapResponse } from "../types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

function formatCoord(value: number): string {
  return value.toFixed(6);
}

export default function MapPage() {
  const { id } = useParams<{ id: string }>();
  const [map, setMap] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Не указан идентификатор события.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    api.venues
      .map(id)
      .then((data) => {
        if (!cancelled) setMap(data);
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
      <h2 className="page__title">Карта площадок</h2>
      {error && <p className="alert">{error}</p>}
      {loading && <p className="muted">Загрузка…</p>}
      {!loading && !error && map && (
        <>
          {map.center ? (
            <div className="map-placeholder">
              <p className="muted">Здесь будет карта (картографическая библиотека не подключена).</p>
              <p>
                Центр: {formatCoord(map.center.latitude)}, {formatCoord(map.center.longitude)}
              </p>
            </div>
          ) : (
            <p className="muted">Координаты центра не заданы.</p>
          )}
          {map.venues.length === 0 ? (
            <p className="muted">Площадки не добавлены.</p>
          ) : (
            <ul className="list">
              {map.venues.map((venue) => (
                <li key={String(venue.id)} className="list__item">
                  <strong>{venue.name}</strong>
                  <div className="muted">{venue.address}</div>
                  <div className="muted">
                    {venue.latitude !== null && venue.longitude !== null
                      ? `${formatCoord(venue.latitude)}, ${formatCoord(venue.longitude)}`
                      : "Координаты не заданы"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
