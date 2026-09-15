/**
 * РЎС‚СЂР°РЅРёС†Р° СЂРµСЃСѓСЂСЃРЅРѕРіРѕ СЂР°СЃРїРёСЃР°РЅРёСЏ /events/:id/resource-schedule.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../services/api";
import type { ResourceScheduleResponse } from "../types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "РќРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР°";
}

function formatDay(value: number | null): string {
  return value === null ? "вЂ”" : `РґРµРЅСЊ ${value}`;
}

export default function ResourceSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const [schedule, setSchedule] = useState<ResourceScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = (): void => {
    if (!id) {
      setError("РќРµ СѓРєР°Р·Р°РЅ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ СЃРѕР±С‹С‚РёСЏ.");
      return;
    }

    setLoading(true);
    setError(null);
    api.resourcesSchedule
      .calculate(id)
      .then((data) => setSchedule(data))
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  return (
    <section className="page">
      <h2 className="page__title">Р РµСЃСѓСЂСЃРЅРѕРµ СЂР°СЃРїРёСЃР°РЅРёРµ</h2>
      {error && <p className="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="button" onClick={calculate} disabled={loading}>
          {loading ? "Р Р°СЃС‡С‘С‚вЂ¦" : "Р Р°СЃСЃС‡РёС‚Р°С‚СЊ"}
        </button>
      </div>
      {schedule && (
        <>
          <p className="cpm-summary">
            Р”Р»РёС‚РµР»СЊРЅРѕСЃС‚СЊ РїСЂРѕРµРєС‚Р° (СЃ СѓС‡С‘С‚РѕРј СЂРµСЃСѓСЂСЃРѕРІ):{" "}
            <strong>{schedule.resource_project_duration}</strong> РґРЅ.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Р—Р°РґР°С‡Р°</th>
                <th>Р¤Р°РєС‚РёС‡РµСЃРєРѕРµ РЅР°С‡Р°Р»Рѕ</th>
                <th>Р¤Р°РєС‚РёС‡РµСЃРєРѕРµ РѕРєРѕРЅС‡Р°РЅРёРµ</th>
                <th>Р—Р°РґРµСЂР¶РєР° (РґРЅ.)</th>
                <th>РљСЂРёС‚РёС‡РµСЃРєР°СЏ</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(schedule.schedule).map(([taskId, item]) => (
                <tr key={taskId} className={item.is_critical ? "table__row--critical" : undefined}>
                  <td>{taskId}</td>
                  <td>{formatDay(item.actual_start)}</td>
                  <td>{formatDay(item.actual_finish)}</td>
                  <td>{item.delay_days}</td>
                  <td>
                    <span className={`badge${item.is_critical ? " badge--critical" : ""}`}>
                      {item.is_critical ? "РґР°" : "РЅРµС‚"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
