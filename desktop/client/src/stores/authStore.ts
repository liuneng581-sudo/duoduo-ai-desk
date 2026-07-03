import { create } from 'zustand';
import api from '../services/api';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  updateProfile: (data: { name?: string }) => Promise<void>;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const res = await api.post('/auth/login', { email, password });
      const { accessToken, user } = res.data;
      localStorage.setItem('accessToken', accessToken);
      set({ user, accessToken, isLoading: false });
    } catch (err) {
      // Rethrow the original axios error so the page can surface the specific
      // server message (e.g. 邮箱或密码错误) via err.response.data.error.
      set({ isLoading: false });
      throw err;
    }
  },

  register: async (email, password, name) => {
    set({ isLoading: true });
    try {
      const res = await api.post('/auth/register', { email, password, name });
      const { accessToken, user } = res.data;
      localStorage.setItem('accessToken', accessToken);
      set({ user, accessToken, isLoading: false });
    } catch (err) {
      // Rethrow original error so the page shows the real reason (e.g. 邮箱已注册).
      set({ isLoading: false });
      throw err;
    }
  },

  logout: () => {
    // Best-effort server logout: bumps the token version (revoking refresh
    // tokens) and clears the httpOnly refresh cookie. Without this the cookie
    // stays valid for its full 7-day lifetime even after "logging out". Clear
    // local state regardless of the request outcome.
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('accessToken');
    set({ user: null, accessToken: null });
  },

  fetchMe: async () => {
    try {
      const res = await api.get('/auth/me');
      set({ user: res.data });
    } catch {
      localStorage.removeItem('accessToken');
      set({ user: null, accessToken: null });
    }
  },

  updateProfile: async (data) => {
    const res = await api.patch('/auth/me', data);
    set({ user: res.data });
  },

  initialize: () => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      set({ accessToken: token });
    }
  },
}));
