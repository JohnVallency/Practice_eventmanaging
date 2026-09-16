/**
 * Страница финансов события /events/:id/finances.
 * Сводка бюджета + список расходов + добавление расхода (Modal).
 * DELETE расходов бэкенд не поддерживает — кнопок удаления нет.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { EmptyState, Field, Modal, Skeleton, useToast } from "../components/ui";
import { api } from "../services/api";
import { describeError } from "../services/errors";
import type { BudgetSummaryResponse, Expense } from "../types";

interface ExpenseFormState {
  category: string;
  amount: string;
  date: string;
  description: string;
}

const EMPTY_FORM: ExpenseFormState = { category: "", amount: "", date: "", description: "" };

interface ValidationErrors {
  category?: string;
  amount?: string;
  date?: string;
}

function formatMoney(value: string): string {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `${num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function formatDate(value: string): string {
  const num = Date.parse(value);
  if (Number.isNaN(num)) return value.slice(0, 10);
  return new Date(num).toLocaleDateString("ru-RU");
}

function validate(form: ExpenseFormState): ValidationErrors {
  const errors: ValidationErrors = {};
  if (form.category.trim() === "") {
    errors.category = "Введите категорию";
  }
  const amount = Number(form.amount);
  if (form.amount.trim() === "" || Number.isNaN(amount) || amount <= 0) {
    errors.amount = "Сумма должна быть больше нуля";
  }
  if (form.date === "") {
    errors.date = "Укажите дату расхода";
  }
  return errors;
}

export default function FinancesPage() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<BudgetSummaryResponse | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const toast = useToast();

  const load = useCallback(
    async (eventId: string): Promise<void> => {
      setLoading(true);
      try {
        const [summaryData, expensesData] = await Promise.all([
          api.finances.budgetSummary(eventId),
          api.finances.listExpenses(eventId),
        ]);
        setSummary(summaryData);
        setExpenses(expensesData);
        setError(null);
      } catch (err: unknown) {
        const message = describeError(err);
        setError(message);
        toast.push({ tone: "error", title: "Не удалось загрузить финансы", message });
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

  const patch = (part: Partial<ExpenseFormState>): void => {
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
      const created = await api.finances.createExpense(id, {
        category: form.category.trim(),
        amount: Number(form.amount).toFixed(2),
        date: form.date,
        description: form.description.trim() === "" ? undefined : form.description.trim(),
      });
      setExpenses((prev) => [...prev, created]);
      const fresh = await api.finances.budgetSummary(id);
      setSummary(fresh);
      toast.push({ tone: "ok", title: "Расход добавлен" });
      setForm(EMPTY_FORM);
      setErrors({});
      setModalOpen(false);
    } catch (err: unknown) {
      const message = describeError(err);
      toast.push({ tone: "error", title: "Не удалось добавить расход", message });
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

  const budgetNum = summary?.total_budget !== null && summary !== null ? Number(summary.total_budget) : null;
  const expensesNum = summary !== null ? Number(summary.total_expenses) : null;
  const remainingNum =
    summary?.remaining_budget !== null && summary !== null ? Number(summary.remaining_budget) : null;
  const hasBudget = budgetNum !== null && budgetNum > 0;
  const overBudget = remainingNum !== null && remainingNum < 0;
  const progressPercent =
    hasBudget && expensesNum !== null
      ? Math.min(100, (expensesNum / (budgetNum ?? 1)) * 100)
      : 0;

  return (
    <section className="page">
      <div className="page__header">
        <div>
          <div className="eyebrow">Бюджет и расходы</div>
          <h2 className="page__title">Финансы</h2>
          <p className="muted">
            Остаток = бюджет − расходы. Процент расходов и превышение видны сразу.
          </p>
        </div>
        <button
          type="button"
          className="btn--primary"
          onClick={() => {
            setForm(EMPTY_FORM);
            setErrors({});
            setModalOpen(true);
          }}
        >
          Добавить расход
        </button>
      </div>

      {loading && (
        <div className="grid-cards">
          <div className="card">
            <Skeleton w="40%" h={18} />
            <Skeleton w="60%" h={24} />
          </div>
          <div className="card">
            <Skeleton w="40%" h={18} />
            <Skeleton w="60%" h={24} />
          </div>
        </div>
      )}

      {!loading && error !== null && (
        <EmptyState title="Ошибка загрузки" hint={error} />
      )}

      {!loading && error === null && summary !== null && (
        <>
          <div className="card">
            {hasBudget ? (
              <>
                <div className="grid-cards">
                  <div className="finance-figure">
                    <div className="stat-card__label">Бюджет</div>
                    <strong>{formatMoney(summary.total_budget ?? "0")}</strong>
                  </div>
                  <div className="finance-figure">
                    <div className="stat-card__label">Израсходовано</div>
                    <strong>{formatMoney(summary.total_expenses)}</strong>
                  </div>
                  <div className="finance-figure">
                    <div className="stat-card__label">Остаток</div>
                    <strong className={overBudget ? "danger-text" : undefined}>
                      {summary.remaining_budget === null
                        ? "—"
                        : formatMoney(summary.remaining_budget)}
                    </strong>
                  </div>
                </div>
                <div className="progress">
                  <div
                    className={overBudget ? "progress__fill progress__fill--over" : "progress__fill"}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="muted">Бюджет не задан</p>
            )}
          </div>

          <div className="hint-panel" style={{ marginTop: 12 }}>
            <strong>Остаток</strong> = Бюджет − Расходы. Красный прогресс-бар — бюджет превышен:
            либо сократите расходы, либо увеличьте бюджет на карточке события («Редактировать»).
          </div>

          {expenses.length === 0 ? (
            <EmptyState
              title="Расходов пока нет"
              hint="Добавьте первый расход кнопкой «Добавить расход»."
              action={
                <button
                  type="button"
                  className="btn--primary"
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setErrors({});
                    setModalOpen(true);
                  }}
                >
                  Добавить расход
                </button>
              }
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Категория</th>
                  <th>Сумма</th>
                  <th>Дата</th>
                  <th>Описание</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.category}</td>
                    <td>{formatMoney(expense.amount)}</td>
                    <td>{formatDate(expense.date)}</td>
                    <td className="muted">{expense.description ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <Modal
        open={modalOpen}
        title="Добавить расход"
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
                const formEl = document.getElementById("expense-form") as HTMLFormElement | null;
                formEl?.requestSubmit();
              }}
            >
              {submitting ? "Сохранение…" : "Добавить"}
            </button>
          </>
        }
      >
        <form id="expense-form" onSubmit={(e) => void handleCreate(e)} noValidate>
          <Field
            label="Категория"
            required
            error={errors.category}
            value={form.category}
            onChange={(e) => patch({ category: e.target.value })}
            placeholder="Например: Аренда зала"
          />
          <Field
            label="Сумма"
            type="number"
            required
            step="0.01"
            min="0.01"
            error={errors.amount}
            value={form.amount}
            onChange={(e) => patch({ amount: e.target.value })}
          />
          <Field
            label="Дата"
            type="date"
            required
            error={errors.date}
            value={form.date}
            onChange={(e) => patch({ date: e.target.value })}
          />
          <Field
            label="Описание"
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Необязательно"
          />
        </form>
      </Modal>
    </section>
  );
}
