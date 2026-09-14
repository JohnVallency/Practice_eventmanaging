/**
 * Лёгкое внешнее хранилище состояния API на useSyncExternalStore.
 * Без внешних библиотек: подписки через addEventListener.
 */

import { useSyncExternalStore } from "react";

import { getHealth } from "../services/api";
import type { ApiState } from "../types";

let state: ApiState = {
  status: "idle",
  health: null,
  error: null,
  checkedAt: null,
};

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(patch: Partial<ApiState>): void {
  state = { ...state, ...patch };
  emitChange();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getState(): ApiState {
  return state;
}

/**
 * Запросить /health и обновить состояние хранилища.
 * Ошибки сети переводят статус в "offline" и сохраняются в state.error.
 */
export async function refreshHealth(): Promise<void> {
  setState({ status: "loading", error: null });

  try {
    const health = await getHealth();
    setState({
      status: health.status === "ok" ? "online" : "offline",
      health,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    setState({
      status: "offline",
      health: null,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
      checkedAt: new Date().toISOString(),
    });
  }
}

/**
 * React-хук доступа к состоянию API.
 */
export function useApiState(): ApiState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export const apiStore = { refreshHealth };
