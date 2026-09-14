/**
 * Корневой компонент приложения EventLMS.
 */

import StatusCard from "./components/StatusCard";
import { API_BASE_URL } from "./services/api";
import { refreshHealth, useApiState } from "./store/apiStore";

/**
 * Отрисовать стартовую страницу EventLMS со статусом бэкенда.
 */
export default function App() {
  const api = useApiState();

  return (
    <main className="app">
      <header className="app__header">
        <h1>EventLMS</h1>
        <p>Планирование событий: DAG-зависимости, критический путь, ресурсы.</p>
      </header>
      <StatusCard api={api} baseUrl={API_BASE_URL} onRetry={() => void refreshHealth()} />
    </main>
  );
}
