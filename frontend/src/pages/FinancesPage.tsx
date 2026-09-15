/**
 * Страница финансов события /events/:id/finances.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../services/api";
import type { BudgetSummaryResponse } from "../types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

export default function FinancesPage() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<BudgetSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Не указан идентификатор события.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    api.finances
      .budgetSummary(id)
      .then((data) => {
        if (!cancelled) setSummary(data);
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

  const isOverBudget = summary?.remaining_budget !== null && summary !== null
    ? Number(summary.remaining_budget) < 0
    : false;

  return (
    <section className="page">
      <h2 className="page__title">Финансы</h2>
      {error && <p className="alert">{error}</p>}
      {loading && <p className="muted">Загрузка…</p>}
      {!loading && !error && summary && (
        <dl className="card__fields card__fields--grid">
          <div>
            <dt>Общий бюджет</dt>
            <dd>{summary.total_budget ?? "—"}</dd>
          </div>
          <div>
            <dt>Всего расходов</dt>
            <dd>{summary.total_expenses}</dd>
          </div>
          <div>
            <dt>Остаток бюджета</dt>
            <dd className={isOverBudget ? "danger" : undefined}>{summary.remaining_budget ?? "—"}</dd>
          </div>
          <div>
            <dt>Количество расходов</dt>
            <dd>{summary.expenses_count}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
