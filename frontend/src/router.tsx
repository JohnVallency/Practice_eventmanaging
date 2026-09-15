/**
 * Конфигурация маршрутов React Router v6 (data router).
 */

import { createBrowserRouter, Navigate } from "react-router-dom";

import Layout from "./components/Layout";
import EventsPage from "./pages/EventsPage";
import EventDetailPage from "./pages/EventDetailPage";
import TasksPage from "./pages/TasksPage";
import SchedulePage from "./pages/SchedulePage";
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
      { path: "/events/:id", element: <EventDetailPage /> },
      { path: "/events/:id/tasks", element: <TasksPage /> },
      { path: "/events/:id/schedule", element: <SchedulePage /> },
      { path: "/events/:id/resource-schedule", element: <ResourceSchedulePage /> },
      { path: "/events/:id/finances", element: <FinancesPage /> },
      { path: "/events/:id/map", element: <MapPage /> },
      { path: "/events/:id/notifications", element: <NotificationsPage /> },
      { path: "*", element: <Navigate to="/events" replace /> },
    ],
  },
]);
