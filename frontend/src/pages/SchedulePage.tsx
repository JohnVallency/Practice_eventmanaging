/**
 * РЎС‚СЂР°РЅРёС†Р° CPM-СЂР°СЃРїРёСЃР°РЅРёСЏ /events/:id/schedule.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../services/api";
import type { ScheduleCalculationResponse } from "../types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "РќРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР°";
}

function formatDay(value: number | null): string {
  return value === null ? "вЂ”" : `РґРµРЅСЊ ${value}`;
}

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const [schedule, setSchedule] = useState<ScheduleCalculationResponse | null>(null);
  const [taskNames, setTaskNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("РќРµ СѓРєР°Р·Р°РЅ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ СЃРѕР±С‹С‚РёСЏ.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    api.tasks
      .list(id)
      .then((data) => {
        if (!cancelled) {
          const names: Record<string, string> = {};
          for (const task of data) {
            names[String(task.id)] = task.name;
          }
          setTaskNames(names);
        }
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

  const calculate = (): void => {
    if (!id) return;

    setCalculating(true);
    api.schedule
      .calculate(id)
      .then((data) => setSchedule(data))
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setCalculating(false));
  };

  return (
    <section className="page">
      <h2 className="page__title">CPM-СЂР°СЃРїРёСЃР°РЅРёРµ</h2>
      {error && <p className="alert">{error}</p>}
      {loading && <p className="muted">Р—Р°РіСЂСѓР·РєР°вЂ¦</p>}
      <div className="actions">
        <button type="button" className="button" onClick={calculate} disabled={calculating}>
          {calculating ? "Р Р°СЃС‡С‘С‚вЂ¦" : "Р Р°СЃСЃС‡РёС‚Р°С‚СЊ"}
        </button>
      </div>
      {schedule && (
        <>
          <p className="cpm-summary">
            Р”Р»РёС‚РµР»СЊРЅРѕСЃС‚СЊ РїСЂРѕРµРєС‚Р°: <strong>{schedule.project_duration}</strong> РґРЅ. В· РљСЂРёС‚РёС‡РµСЃРєРёР№
            РїСѓС‚СЊ: <strong>{schedule.critical_path.length}</strong> Р·Р°РґР°С‡.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Р—Р°РґР°С‡Р°</th>
                <th>Р Р°РЅРЅРµРµ РЅР°С‡Р°Р»Рѕ</th>
                <th>Р Р°РЅРЅРµРµ РѕРєРѕРЅС‡Р°РЅРёРµ</th>
                <th>РџРѕР·РґРЅРµРµ РЅР°С‡Р°Р»Рѕ</th>
                <th>РџРѕР·РґРЅРµРµ РѕРєРѕРЅС‡Р°РЅРёРµ</th>
                <th>РџРѕР»РЅС‹Р№ СЂРµР·РµСЂРІ</th>
                <th>РЎРІРѕР±РѕРґРЅС‹Р№ СЂРµР·РµСЂРІ</th>
                <th>РљСЂРёС‚РёС‡РµСЃРєР°СЏ</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(schedule.schedule).map(([taskId, item]) => (
                <tr
                  key={taskId}
                  className={item.is_critical ? "table__row--critical" : undefined}
                >
                  <td>{taskNames[taskId] ?? taskId}</td>
                  <td>{formatDay(item.earliest_start)}</td>
                  <td>{formatDay(item.earliest_finish)}</td>
                  <td>{formatDay(item.latest_start)}</td>
                  <td>{formatDay(item.latest_finish)}</td>
                  <td>{item.total_float}</td>
                  <td>{item.free_float}</td>
                  <td>
                    <span className={`badge${item.is_critical ? " badge--critical" : ""}`}>
                      {item.is_critical ? "РґР°" : "РЅРµС‚"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="page__subtitle">РљСЂРёС‚РёС‡РµСЃРєРёР№ РїСѓС‚СЊ</h3>
          {schedule.critical_path.length === 0 ? (
            <p className="muted">РљСЂРёС‚РёС‡РµСЃРєРёР№ РїСѓС‚СЊ РїСѓСЃС‚.</p>
          ) : (
            <ol className="critical-path">
              {schedule.critical_path.map((taskId, index) => (
                <li key={taskId}>
                  {index + 1}. {taskNames[taskId] ?? taskId} <code>({taskId})</code>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
