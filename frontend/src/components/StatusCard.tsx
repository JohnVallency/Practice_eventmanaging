/**
 * Карточка статуса API: переиспользуемый презентационный компонент.
 */

import type { ApiState } from "../types";

interface StatusCardProps {
  api: ApiState;
  baseUrl: string;
  onRetry: () => void;
}

const STATUS_LABEL: Record<ApiState["status"], string> = {
  idle: "Не проверялось",
  loading: "Проверяется…",
  online: "Онлайн",
  offline: "Недоступен",
};

/**
 * Отрисовать состояние бэкенда и кнопку повторной проверки.
 */
export default function StatusCard({ api, baseUrl, onRetry }: StatusCardProps) {
  return (
    <section className="status-card">
      <h2>Статус API</h2>
      <p>
        Состояние: <strong>{STATUS_LABEL[api.status]}</strong>
      </p>
      {api.health !== null && (
        <p>
          Ответ /health: <code>{JSON.stringify(api.health)}</code>
        </p>
      )}
      {api.error !== null && <p className="status-card__error">Ошибка: {api.error}</p>}
      {api.checkedAt !== null && (
        <p>
          Проверено: <time dateTime={api.checkedAt}>{new Date(api.checkedAt).toLocaleString("ru-RU")}</time>
        </p>
      )}
      <p>
        Адрес API: <code>{baseUrl}</code>
      </p>
      <button type="button" onClick={onRetry} disabled={api.status === "loading"}>
        Проверить снова
      </button>
    </section>
  );
}
