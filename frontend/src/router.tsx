/**
 * Конфигурация маршрутов React Router v6 (data router).
 *
 * Статические сегменты (/events/new) объявлены раньше динамических
 * (/events/:id) для читаемости: React Router v6 ранжирует маршруты
 * по специфичности, порядок объявления на матчинг не влияет.
 */

import { createBrowserRouter, Navigate } from "react-router-dom";

import Layout from "./components/Layout";
import EventsPage from "./pages/EventsPage";
import CreateEventPage from "./pages/CreateEventPage";
import EventDetailPage from "./pages/EventDetailPage";
import EditEventPage from "./pages/EditEventPage";
import TasksPage from "./pages/TasksPage";
import EventGraphPage from "./pages/EventGraphPage";
import SchedulePage from "./pages/SchedulePage";
import ResourcesPage from "./pages/ResourcesPage";
import ResourceSchedulePage from "./pages/ResourceSchedulePage";
import FinancesPage from "./pages/FinancesPage";
import MapPage from "./pages/MapPage";
import NotificationsPage from "./pages/NotificationsPage";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Navigate to="/events" replace /> },
      { path: "/events", element: <EventsPage /> },
      { path: "/events/new", element: <CreateEventPage /> },
      { path: "/events/:id", element: <EventDetailPage /> },
      { path: "/events/:id/edit", element: <EditEventPage /> },
      { path: "/events/:id/tasks", element: <TasksPage /> },
      { path: "/events/:id/graph", element: <EventGraphPage /> },
      { path: "/events/:id/schedule", element: <SchedulePage /> },
      { path: "/events/:id/resources", element: <ResourcesPage /> },
      { path: "/events/:id/resource-schedule", element: <ResourceSchedulePage /> },
      { path: "/events/:id/finances", element: <FinancesPage /> },
      { path: "/events/:id/map", element: <MapPage /> },
      { path: "/events/:id/notifications", element: <NotificationsPage /> },
      { path: "*", element: <Navigate to="/events" replace /> },
    ],
  },
]);
