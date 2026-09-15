/**
 * UI-кит EventLMS: кнопки, поля, модалки, тосты и вспомогательные атомы.
 * Классы стилизованы в index.css (светлая минималистичная тема).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

/* -------------------------------- Кнопка ---------------------------------- */

export type ButtonVariant = "primary" | "ghost" | "danger" | "sm";

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant },
): JSX.Element {
  const { variant = "primary", className, type, ...rest } = props;
  // "sm" — компактный вариант primary-кнопки.
  const variantClass = variant === "sm" ? "btn--primary btn--sm" : `btn--${variant}`;

  return (
    <button
      type={type ?? "button"}
      className={`btn ${variantClass}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}

/* --------------------------------- Поле ----------------------------------- */

export function Field(
  props: {
    label: string;
    error?: string;
    hint?: string;
  } & InputHTMLAttributes<HTMLInputElement> & { children?: ReactNode },
): JSX.Element {
  const { label, error, hint, children, id, className, ...rest } = props;
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={`field${error ? " field--error" : ""}${className ? ` ${className}` : ""}`}>
      <label className="field__label" htmlFor={children ? undefined : inputId}>
        {label}
      </label>
      {children ?? <input id={inputId} className="field__input" {...rest} />}
      {hint ? <div className="field__hint">{hint}</div> : null}
      {error ? <div className="field__error">{error}</div> : null}
    </div>
  );
}

/* -------------------------------- Модалка --------------------------------- */

export function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}): JSX.Element | null {
  const { open, title, onClose, children, footer } = props;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="modal__title">{title}</h2>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__footer">{footer}</div> : null}
      </section>
    </div>
  );
}

/* --------------------------------- Тосты ---------------------------------- */

export type ToastTone = "ok" | "error";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ToastContextValue {
  push: (t: { tone: ToastTone; title: string; message?: string }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider(props: { children: ReactNode }): JSX.Element {
  const { children } = props;
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<ToastContextValue["push"]>(
    (t) => {
      const id = nextIdRef.current++;
      setToasts((prev) => [...prev, { id, tone: t.tone, title: t.title, message: t.message }]);
      const timer = window.setTimeout(() => removeToast(id), 4000);
      timersRef.current.push(timer);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`} role="status">
            <div className="toast__content">
              <div className="toast__title">{toast.title}</div>
              {toast.message ? <div className="toast__message">{toast.message}</div> : null}
            </div>
            <button
              type="button"
              className="toast__close"
              aria-label="Закрыть уведомление"
              onClick={() => removeToast(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast должен вызываться внутри <ToastProvider>");
  }
  return ctx;
}

/* ----------------------------- Прочие атомы ------------------------------- */

export function Spinner(props?: { size?: number }): JSX.Element {
  const size = props?.size ?? 16;
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Загрузка"
    />
  );
}

export function Badge(props: {
  tone?: "critical" | "ok" | "warn" | "muted";
  children: ReactNode;
}): JSX.Element {
  const { tone = "muted", children } = props;
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function EmptyState(props: {
  title: string;
  hint?: string;
  action?: ReactNode;
}): JSX.Element {
  const { title, hint, action } = props;
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {hint ? <div className="empty__hint">{hint}</div> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}

export function Skeleton(props: { w?: number | string; h?: number | string }): JSX.Element {
  const { w = "100%", h = 14 } = props;
  // Число трактуется как пиксели (стандартное поведение React для style), строка — CSS-длина.
  return <span className="skeleton" style={{ width: w, height: h }} aria-hidden="true" />;
}
