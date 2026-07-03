import api from './api';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
    role: string;
  };
}

export const authService = {
  login: (data: LoginInput) => api.post<AuthResponse>('/auth/login', data),
  register: (data: RegisterInput) => api.post<AuthResponse>('/auth/register', data),
  refresh: () => api.post<AuthResponse>('/auth/refresh'),
  me: () => api.get<AuthResponse['user']>('/auth/me'),
};
