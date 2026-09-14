import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { apiStore } from "./store/apiStore";

import "./index.css";
import "./types";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Не найден корневой элемент #root в index.html");
}

apiStore.refreshHealth();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
