import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "@/lib/api";

export interface User {
  id: number;
  name: string;
  email: string;
  username?: string;
  avatar?: string;
  gender?: string;
  phone?: string;
  address?: string;
  created_at?: string;
}

interface UserStore {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
}

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const res = await api.post("/auth/login", {
            email,
            password,
            device_name: "web-app",
          });
          const { token, user } = res.data;
          localStorage.setItem("auth_token", token);
          set({
            token,
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await api.post("/auth/logout");
        } catch {
        } finally {
          localStorage.removeItem("auth_token");
          set({
            user: null,
            token: null,
            isAuthenticated: false,
          });
        }
      },

      fetchMe: async () => {
        const { token } = get();
        if (!token) return;
        set({ isLoading: true });
        try {
          const res = await api.get("/auth/me");
          set({
            user: res.data.user ?? res.data,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
          localStorage.removeItem("auth_token");
        }
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => {
        if (token) {
          localStorage.setItem("auth_token", token);
        } else {
          localStorage.removeItem("auth_token");
        }
        set({ token });
      },
    }),
    {
      name: "auth-store",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export function useUser() {
  return useUserStore();
}
