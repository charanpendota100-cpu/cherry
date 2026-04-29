import { create } from "zustand";
import type { Account, TabId } from "./types";

interface AppState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  accounts: Account[];
  addAccount: (account: Account) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  removeAccount: (id: string) => void;

  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;

  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "dashboard",
  setActiveTab: (tab) => set({ activeTab: tab }),

  accounts: [],
  addAccount: (account) =>
    set((s) => ({ accounts: [...s.accounts, account] })),
  updateAccount: (id, updates) =>
    set((s) => ({
      accounts: s.accounts.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),
  removeAccount: (id) =>
    set((s) => ({
      accounts: s.accounts.filter((a) => a.id !== id),
      activeSessionId:
        s.activeSessionId === s.accounts.find((a) => a.id === id)?.sessionId
          ? null
          : s.activeSessionId,
    })),

  activeSessionId: null,
  setActiveSessionId: (id) => set({ activeSessionId: id }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
