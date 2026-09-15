/**
 * Zustand-хранилище текущего события с persist в localStorage.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Event } from "../types";

interface EventStoreState {
  currentEvent: Event | null;
  setCurrentEvent: (event: Event | null) => void;
  clearCurrentEvent: () => void;
}

export const useEventStore = create<EventStoreState>()(
  persist(
    (set) => ({
      currentEvent: null,
      setCurrentEvent: (event) => set({ currentEvent: event }),
      clearCurrentEvent: () => set({ currentEvent: null }),
    }),
    { name: "eventlms-current-event" },
  ),
);
