/**
 * Человекочитаемые описания ошибок API на русском языке.
 * Единый словарь: бэкенд и axios отдают часть сообщений на английском —
 * здесь они переводятся в понятные подсказки для пользователя.
 */

import { isAxiosError } from "axios";

/** Точечные замены типовых сообщений бэкенда. */
const RU_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /event has no tasks/i,
    "В событии пока нет задач — сначала добавьте их на странице «Задачи».",
  ],
  [
    /cycle/i,
    "Зависимости образуют цикл: задача не может зависеть от себя даже через цепочку других задач.",
  ],
  [
    /resource schedule not calculated/i,
    "Сначала рассчитайте ресурсный план — кнопка «Рассчитать с ресурсами» на странице «Ресурсное расписание».",
  ],
  [
    /resource demand exceeds/i,
    "Потребность в ресурсе больше, чем он может дать в день. Уменьшите «единицы» в назначениях или увеличьте доступность ресурса.",
  ],
  [
    /dependency cycle in resource/i,
    "Не удалось выстроить задачи по ресурсам из-за цикла в зависимостях.",
  ],
  [
    /end_date must be after start_date/i,
    "Дата окончания должна быть позже даты начала.",
  ],
  [
    /not found/i,
    "Объект не найден: возможно, он был удалён в другом окне.",
  ],
];

/** Достать текст ошибки из ответа axios (detail из FastAPI) или из объекта. */
export function describeError(error: unknown): string {
  if (isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (data !== null && typeof data === "object" && "detail" in data) {
      const detail: unknown = (data as { detail?: unknown }).detail;
      if (typeof detail === "string") {
        return translate(detail);
      }
    }
    if (error.response?.status === 404) {
      return "Объект не найден: возможно, он был удалён в другом окне.";
    }
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return translate(error.message);
  }
  return "Неизвестная ошибка. Попробуйте обновить страницу.";
}

function translate(raw: string): string {
  for (const [pattern, human] of RU_MAP) {
    if (pattern.test(raw)) {
      return human;
    }
  }
  return raw;
}
