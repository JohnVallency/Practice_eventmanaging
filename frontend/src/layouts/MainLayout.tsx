import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';

export function MainLayout() {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
