/**
 * Боковая навигация рабочего пространства.
 * Секции: обзор рабочей среды и навигация внутри активного события.
 */

import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  FiActivity,
  FiBell,
  FiCalendar,
  FiCheckCircle,
  FiCheckSquare,
  FiChevronDown,
  FiClock,
  FiDollarSign,
  FiHome,
  FiMap,
  FiPlus,
  FiSettings,
  FiSliders,
  FiTrendingUp,
  FiUsers,
  FiX,
  FiZap,
} from 'react-icons/fi';

import { BrandMark } from './BrandMark';
import { useEventStore } from '../store/eventStore';

const COMPACT_STORAGE_KEY = 'eventlms-compact';

interface SidebarProps {
  open: boolean;
  autoHide: boolean;
  onHoverChange: (open: boolean) => void;
  onAutoHideChange: (value: boolean) => void;
}

type SidebarGroupId = 'tasks' | 'planning' | 'control';

export function Sidebar({ open, autoHide, onHoverChange, onAutoHideChange }: SidebarProps) {
  const location = useLocation();
  const { currentEvent, clearCurrentEvent } = useEventStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<SidebarGroupId, boolean>>({
    tasks: true,
    planning: true,
    control: true,
  });

  const toggleGroup = (group: SidebarGroupId): void => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const groupToggleClass = (group: SidebarGroupId): string =>
    `sidebar__group-toggle${openGroups[group] ? '' : ' sidebar__group-toggle--closed'}`;
  const [compactMode, setCompactMode] = useState(
    () => localStorage.getItem(COMPACT_STORAGE_KEY) === 'true',
  );

  useEffect(() => {
    document.body.dataset.density = compactMode ? 'compact' : 'comfortable';
    localStorage.setItem(COMPACT_STORAGE_KEY, String(compactMode));
  }, [compactMode]);

  const isActive = (path: string): boolean => location.pathname.startsWith(path);

  return (
    <aside
      className={`sidebar${open ? ' sidebar--peek' : ''}`}
      onMouseEnter={autoHide ? () => onHoverChange(true) : undefined}
      onMouseLeave={autoHide ? () => onHoverChange(false) : undefined}
    >
      <div className="sidebar__logo">
        <span className="brand-mark">
          <BrandMark />
        </span>
        <span className="brand">
          <span className="brand-name">
            EventLMS<span>.</span>
          </span>
          <span className="brand-caption">event studio</span>
        </span>
      </div>

      <nav className="sidebar__nav">
        <div className="sidebar__section-label">Рабочая среда</div>
        <Link
          to="/"
          className={`sidebar__item ${location.pathname === '/' ? 'sidebar__item--active' : ''}`}
        >
          <FiHome size={17} />
          <span>Главная</span>
        </Link>
        <Link
          to="/events"
          className={`sidebar__item ${isActive('/events') && !currentEvent ? 'sidebar__item--active' : ''}`}
        >
          <FiCalendar size={17} />
          <span>События</span>
        </Link>

        {currentEvent ? (
          <>
            <div className="sidebar__divider" />
            <div className="sidebar__event-header">
              Активное событие
              <span>{currentEvent.name}</span>
            </div>

            <section className="sidebar__group" aria-label="Задачи">
              <button
                type="button"
                className={groupToggleClass('tasks')}
                onClick={() => toggleGroup('tasks')}
                aria-expanded={openGroups.tasks}
              >
                <span>Задачи</span>
                <FiChevronDown size={13} />
              </button>
              {openGroups.tasks && (
                <>
                  <Link
                    to={`/events/${currentEvent.id}/graph`}
                    className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/graph`) ? 'sidebar__item--active' : ''}`}
                  >
                    <FiZap size={16} />
                    <span>План задач</span>
                  </Link>
                  <Link
                    to={`/events/${currentEvent.id}/tasks`}
                    className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/tasks`) && !location.pathname.endsWith('/tasks/new') && !location.pathname.endsWith('/tasks/active') && !location.pathname.endsWith('/tasks/done') ? 'sidebar__item--active' : ''}`}
                  >
                    <FiCheckSquare size={16} />
                    <span>Все задачи</span>
                  </Link>
                  <Link
                    to={`/events/${currentEvent.id}/tasks/new`}
                    className={`sidebar__item sidebar__item--sub ${location.pathname.endsWith('/tasks/new') ? 'sidebar__item--active' : ''}`}
                  >
                    <FiPlus size={16} />
                    <span>Создать задачу</span>
                  </Link>
                  <Link
                    to={`/events/${currentEvent.id}/tasks/active`}
                    className={`sidebar__item sidebar__item--sub ${location.pathname.endsWith('/tasks/active') ? 'sidebar__item--active' : ''}`}
                  >
                    <FiClock size={16} />
                    <span>В работе</span>
                  </Link>
                  <Link
                    to={`/events/${currentEvent.id}/tasks/done`}
                    className={`sidebar__item sidebar__item--sub ${location.pathname.endsWith('/tasks/done') ? 'sidebar__item--active' : ''}`}
                  >
                    <FiCheckCircle size={16} />
                    <span>Завершённые</span>
                  </Link>
                </>
              )}
            </section>
            <section className="sidebar__group" aria-label="Планирование">
              <button
                type="button"
                className={groupToggleClass('planning')}
                onClick={() => toggleGroup('planning')}
                aria-expanded={openGroups.planning}
              >
                <span>Планирование</span>
                <FiChevronDown size={13} />
              </button>
              {openGroups.planning && (
                <>
                  <Link
                    to={`/events/${currentEvent.id}/schedule`}
                    className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/schedule`) ? 'sidebar__item--active' : ''}`}
                  >
                    <FiTrendingUp size={16} />
                    <span>План CPM</span>
                  </Link>
                  <Link
                    to={`/events/${currentEvent.id}/resource-schedule`}
                    className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/resource-schedule`) ? 'sidebar__item--active' : ''}`}
                  >
                    <FiActivity size={16} />
                    <span>План с ресурсами</span>
                  </Link>
                  <Link
                    to={`/events/${currentEvent.id}/resources`}
                    className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/resources`) ? 'sidebar__item--active' : ''}`}
                  >
                    <FiUsers size={16} />
                    <span>Ресурсы</span>
                  </Link>
                </>
              )}
            </section>
            <section className="sidebar__group" aria-label="Контроль">
              <button
                type="button"
                className={groupToggleClass('control')}
                onClick={() => toggleGroup('control')}
                aria-expanded={openGroups.control}
              >
                <span>Контроль</span>
                <FiChevronDown size={13} />
              </button>
              {openGroups.control && (
                <>
                  <Link
                    to={`/events/${currentEvent.id}/finances`}
                    className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/finances`) ? 'sidebar__item--active' : ''}`}
                  >
                    <FiDollarSign size={16} />
                    <span>Финансы</span>
                  </Link>
                  <Link
                    to={`/events/${currentEvent.id}/map`}
                    className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/map`) ? 'sidebar__item--active' : ''}`}
                  >
                    <FiMap size={16} />
                    <span>Карта площадок</span>
                  </Link>
                  <Link
                    to={`/events/${currentEvent.id}/notifications`}
                    className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/notifications`) ? 'sidebar__item--active' : ''}`}
                  >
                    <FiBell size={16} />
                    <span>Уведомления</span>
                  </Link>
                </>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="sidebar__divider" />
            <div className="sidebar__event-header">
              Событие не выбрано
              <span>Выберите в списке событий</span>
            </div>
            <Link to="/events" className="sidebar__item sidebar__item--sub">
              <FiCheckSquare size={16} />
              <span>Открыть список</span>
            </Link>
          </>
        )}
      </nav>

      {currentEvent && (
        <button type="button" className="sidebar__reset" onClick={clearCurrentEvent}>
          <FiX size={14} />
          <span>Сбросить событие</span>
        </button>
      )}

      <div className="sidebar__footer">
        {settingsOpen && (
          <div className="settings-popover">
            <div className="settings-popover__eyebrow">Рабочая среда</div>
            <div className="settings-popover__title">Настройки интерфейса</div>
            <label className="settings-toggle">
              <span>
                <strong>Плотный режим</strong>
                <small>Больше данных на экране</small>
              </span>
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(event) => setCompactMode(event.target.checked)}
              />
              <span className="settings-toggle__track" aria-hidden="true" />
            </label>
            <label className="settings-toggle">
              <span>
                <strong>Скрывать панель</strong>
                <small>Выезжает при наведении на край</small>
              </span>
              <input
                type="checkbox"
                checked={autoHide}
                onChange={(event) => onAutoHideChange(event.target.checked)}
              />
              <span className="settings-toggle__track" aria-hidden="true" />
            </label>
          </div>
        )}
        <button
          type="button"
          className={`sidebar__settings ${settingsOpen ? 'sidebar__settings--active' : ''}`}
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
        >
          <FiSettings size={16} />
          <span>Настройки</span>
          <FiSliders className="sidebar__settings-icon" size={13} />
        </button>
        <div className="sidebar__version">workspace / 01</div>
      </div>
    </aside>
  );
}
