/**
 * Каркас рабочего пространства: боковая навигация, полоса контекста и <Outlet />.
 * Каждая страница получает тосты через ToastProvider.
 */

import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { FiActivity, FiChevronRight } from 'react-icons/fi';

import { Sidebar } from '../components/Sidebar';
import { ToastProvider } from '../components/ui';
import { useEventStore } from '../store/eventStore';

function formatToday(): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

const SIDEBAR_AUTOHIDE_KEY = 'eventlms-sidebar-autohide';

export function MainLayout() {
  const { currentEvent } = useEventStore();
  const [sidebarAutoHide, setSidebarAutoHide] = useState(
    () => localStorage.getItem(SIDEBAR_AUTOHIDE_KEY) !== 'false',
  );
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(
    () => (): void => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
    },
    [],
  );

  const handleAutoHideChange = (value: boolean): void => {
    localStorage.setItem(SIDEBAR_AUTOHIDE_KEY, String(value));
    setSidebarAutoHide(value);
    if (!value) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setSidebarPeek(false);
    }
  };

  const handleSidebarHover = (open: boolean): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open) {
      setSidebarPeek(true);
    } else {
      closeTimer.current = window.setTimeout(() => setSidebarPeek(false), 180);
    }
  };

  return (
    <ToastProvider>
      <div className={`app-container${sidebarAutoHide ? ' app-container--autohide' : ''}`}>
        {sidebarAutoHide && (
          <div
            className={`sidebar-edge${sidebarPeek ? ' sidebar-edge--active' : ''}`}
            onMouseEnter={() => handleSidebarHover(true)}
            aria-hidden="true"
          >
            <span className="sidebar-edge__tab" />
          </div>
        )}
        <Sidebar
          open={sidebarAutoHide ? sidebarPeek : true}
          autoHide={sidebarAutoHide}
          onHoverChange={handleSidebarHover}
          onAutoHideChange={handleAutoHideChange}
        />
        <main className="main-content">
          <header className="workspace-bar">
            <div className="workspace-bar__crumbs">
              <span className="workspace-bar__root">
                <FiActivity size={14} /> Event operations
              </span>
              <FiChevronRight className="workspace-bar__chevron" size={13} />
              <span className="workspace-bar__event">
                {currentEvent ? currentEvent.name : 'Портфель проектов'}
              </span>
            </div>
            <div className="workspace-bar__meta">
              <span className="workspace-bar__date">{formatToday()}</span>
              <span className="workspace-bar__status">
                <span /> Синхронизировано
              </span>
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
