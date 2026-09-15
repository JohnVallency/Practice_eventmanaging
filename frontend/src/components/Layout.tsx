/**
 * Общий каркас приложения: липкая шапка, навигация, chip текущего события
 * и <Outlet /> для дочерних маршрутов. Вся выдача обёрнута в ToastProvider —
 * тосты доступны на всех страницах.
 */

import { NavLink, Outlet } from "react-router-dom";

import { ToastProvider } from "./ui";

import { useEventStore } from "../store/eventStore";

interface NavLinkConfig {
  to: string;
  label: string;
  end?: boolean;
}

const baseLinks: NavLinkConfig[] = [{ to: "/events", label: "События", end: true }];

export default function Layout() {
  const currentEvent = useEventStore((state) => state.currentEvent);
  const clearCurrentEvent = useEventStore((state) => state.clearCurrentEvent);

  const eventLinks: NavLinkConfig[] = currentEvent
    ? [
        { to: `/events/${currentEvent.id}/tasks`, label: "Задачи" },
        { to: `/events/${currentEvent.id}/graph`, label: "Граф" },
        { to: `/events/${currentEvent.id}/schedule`, label: "План" },
        { to: `/events/${currentEvent.id}/resources`, label: "Ресурсы" },
        { to: `/events/${currentEvent.id}/finances`, label: "Финансы" },
        { to: `/events/${currentEvent.id}/map`, label: "Карта" },
        { to: `/events/${currentEvent.id}/notifications`, label: "Уведомления" },
      ]
    : [];

  return (
    <ToastProvider>
      <div className="layout">
        <header className="layout__header">
          <div className="layout__brand">
            <span className="layout__logo">EventLMS</span>
            {currentEvent && (
              <span className="nav__event">
                <span className="nav__event-name">{currentEvent.name}</span>
                <button
                  type="button"
                  className="nav__event-close"
                  aria-label="Сбросить текущее событие"
                  title="Сбросить текущее событие"
                  onClick={clearCurrentEvent}
                >
                  ×
                </button>
              </span>
            )}
          </div>
          <nav className="nav">
            {[...baseLinks, ...eventLinks].map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `nav__link${isActive ? " nav__link--active" : ""}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="layout__content">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
