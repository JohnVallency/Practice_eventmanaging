import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { api } from '../services/api';
import { describeError } from '../services/errors';
import type { Event } from '../types';
import { Button, useToast } from '../components/ui';

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState({
    totalEvents: 0,
    activeEvents: 0,
    totalTasks: 0,
    criticalTasks: 0
  });
  const toast = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      
      // Загружаем события
      const eventsData = await api.events.list();
      setEvents(eventsData);
      
      // Считаем статистику
      const activeCount = eventsData.filter(e => e.status === 'active').length;
      
      // Загружаем задачи всех событий
      let allTasks: any[] = [];
      for (const event of eventsData) {
        const tasks = await api.tasks.list(event.id);
        allTasks = allTasks.concat(tasks);
      }
      const criticalCount = allTasks.filter(t => t.is_critical === true).length;
      
      setStats({
        totalEvents: eventsData.length,
        activeEvents: activeCount,
        totalTasks: allTasks.length,
        criticalTasks: criticalCount
      });
    } catch (err) {
      toast.push({ tone: 'error', title: describeError(err) });
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'd MMM yyyy', { locale: ru });
    } catch {
      return dateStr;
    }
  };

  const statusLabels: Record<string, string> = {
    draft: 'Черновик',
    active: 'Активно',
    completed: 'Завершено',
    archived: 'В архиве'
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page__header">
          <h1 className="page__title">Обзор проектов</h1>
        </div>
        <div className="dashboard__stats">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="stat-card skeleton" style={{ height: 120 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Обзор проектов</h1>
      </div>

      {/* Статистика */}
      <div className="dashboard__stats">
        <div className="stat-card">
          <div className="stat-card__value">{stats.totalEvents}</div>
          <div className="stat-card__label">Всего событий</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-card__value">{stats.activeEvents}</div>
          <div className="stat-card__label">Активных событий</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-card__value">{stats.totalTasks}</div>
          <div className="stat-card__label">Всего задач</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--critical">{stats.criticalTasks}</div>
          <div className="stat-card__label">Критических задач</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="dashboard__section">
        <div className="quick-actions">
          <Link to="/events/new">
            <Button variant="primary">+ Создать событие</Button>
          </Link>
          <Link to="/events">
            <Button variant="ghost">Все события</Button>
          </Link>
        </div>
      </div>

      {/* Последние события */}
      <div className="dashboard__section">
        <h2 className="dashboard__section-title">Последние события</h2>
        {events.length === 0 ? (
          <div className="empty">
            <p className="empty__title">Нет событий</p>
            <p className="empty__hint">Создайте первое событие, чтобы начать планирование</p>
            <Link to="/events/new">
              <Button variant="primary">Создать событие</Button>
            </Link>
          </div>
        ) : (
          <div className="recent-events">
            {events.slice(0, 5).map(event => (
              <div key={event.id} className="event-card">
                <div>
                  <h3 className="event-card__title">{event.name}</h3>
                  <div className="event-card__meta">
                    <span className="muted">
                      {formatDate(event.start_date)} — {formatDate(event.end_date)}
                    </span>
                    <span className={`badge badge--${event.status === 'active' ? 'success' : 'muted'}`}>
                      {statusLabels[event.status] || event.status}
                    </span>
                  </div>
                </div>
                <Link to={`/events/${event.id}`}>
                  <Button variant="ghost">Открыть</Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
