import { Link, useLocation } from 'react-router-dom';
import { FiHome, FiCalendar, FiCheckSquare, FiDollarSign, FiGrid, FiUsers, FiTrendingUp, FiMap, FiBell, FiX } from 'react-icons/fi';
import { useEventStore } from '../store/eventStore';

export function Sidebar() {
  const location = useLocation();
  const { currentEvent, clearCurrentEvent } = useEventStore();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <FiGrid size={24} />
        <span>EventLMS</span>
      </div>

      <nav className="sidebar__nav">
        <Link to="/" className={`sidebar__item ${isActive('/') && location.pathname === '/' ? 'sidebar__item--active' : ''}`}>
          <FiHome size={18} />
          <span>Главная</span>
        </Link>

        <Link to="/events" className={`sidebar__item ${isActive('/events') && !currentEvent ? 'sidebar__item--active' : ''}`}>
          <FiCalendar size={18} />
          <span>События</span>
        </Link>

        <Link to="/tasks" className={`sidebar__item ${isActive('/tasks') ? 'sidebar__item--active' : ''}`}>
          <FiCheckSquare size={18} />
          <span>Все задачи</span>
        </Link>

        <Link to="/budgets" className={`sidebar__item ${isActive('/budgets') ? 'sidebar__item--active' : ''}`}>
          <FiDollarSign size={18} />
          <span>Бюджеты</span>
        </Link>

        {currentEvent && (
          <>
            <div className="sidebar__divider" />
            <div className="sidebar__event-header">
              <span>{currentEvent.name}</span>
            </div>

            <Link to={`/events/${currentEvent.id}/tasks`} className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/tasks`) ? 'sidebar__item--active' : ''}`}>
              <FiCheckSquare size={16} />
              <span>Задачи</span>
            </Link>

            <Link to={`/events/${currentEvent.id}/graph`} className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/graph`) ? 'sidebar__item--active' : ''}`}>
              <FiGrid size={16} />
              <span>Граф</span>
            </Link>

            <Link to={`/events/${currentEvent.id}/resources`} className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/resources`) ? 'sidebar__item--active' : ''}`}>
              <FiUsers size={16} />
              <span>Ресурсы</span>
            </Link>

            <Link to={`/events/${currentEvent.id}/schedule`} className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/schedule`) ? 'sidebar__item--active' : ''}`}>
              <FiTrendingUp size={16} />
              <span>План</span>
            </Link>

            <Link to={`/events/${currentEvent.id}/resource-schedule`} className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/resource-schedule`) ? 'sidebar__item--active' : ''}`}>
              <FiTrendingUp size={16} />
              <span>План с ресурсами</span>
            </Link>

            <Link to={`/events/${currentEvent.id}/finances`} className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/finances`) ? 'sidebar__item--active' : ''}`}>
              <FiDollarSign size={16} />
              <span>Финансы</span>
            </Link>

            <Link to={`/events/${currentEvent.id}/map`} className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/map`) ? 'sidebar__item--active' : ''}`}>
              <FiMap size={16} />
              <span>Карта</span>
            </Link>

            <Link to={`/events/${currentEvent.id}/notifications`} className={`sidebar__item sidebar__item--sub ${isActive(`/events/${currentEvent.id}/notifications`) ? 'sidebar__item--active' : ''}`}>
              <FiBell size={16} />
              <span>Уведомления</span>
            </Link>
          </>
        )}
      </nav>

      {currentEvent && (
        <button className="sidebar__reset" onClick={clearCurrentEvent}>
          <FiX size={16} />
          <span>Сбросить событие</span>
        </button>
      )}
    </aside>
  );
}
