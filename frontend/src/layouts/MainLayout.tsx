import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { ToastProvider } from '../components/ui';

export function MainLayout() {
  return (
    <ToastProvider>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
