import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authService } from "@/services/auth.service";
import { STORAGE_KEYS } from "@/config";

export interface User {
  id: number;
  name?: string;
  first_name: string;
  last_name: string;
  email: string;
  username?: string;
  avatar?: string;
  avatar_url?: string;
  gender?: string;
  phone?: string;
  role?: string;
  status?: string;
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
          const res = await authService.login(email, password); 
          
          const token = res.data.access_token;
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
          
          const userRes = await authService.fetchMe(token);

          set({
            token,
            user: userRes.data,
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
          await authService.logout();
        } catch {
        } finally {
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
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
          const res = await authService.fetchMe();
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
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        }
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => {
        if (token) {
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
        } else {
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        }
        set({ token });
      },
    }),
    {
      name: STORAGE_KEYS.AUTH_STORE,
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
