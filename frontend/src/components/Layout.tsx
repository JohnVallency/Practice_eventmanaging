/**
 * Общий каркас приложения: шапка, навигация и <Outlet /> для дочерних маршрутов.
 */

import { NavLink, Outlet } from "react-router-dom";

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
        { to: `/events/${currentEvent.id}/schedule`, label: "CPM-расписание" },
        { to: `/events/${currentEvent.id}/resource-schedule`, label: "Ресурсы" },
        { to: `/events/${currentEvent.id}/finances`, label: "Финансы" },
        { to: `/events/${currentEvent.id}/map`, label: "Карта" },
        { to: `/events/${currentEvent.id}/notifications`, label: "Уведомления" },
      ]
    : [];

  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__brand">
          <span className="layout__logo">EventLMS</span>
          {currentEvent && (
            <span className="layout__event">
              <span className="layout__event-name">{currentEvent.name}</span>
              <button type="button" className="layout__reset" onClick={clearCurrentEvent}>
                Сбросить
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
  );
}
