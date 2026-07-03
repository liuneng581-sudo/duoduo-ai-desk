import api from './api';

export interface Store {
  id: string;
  name: string;
  shopId?: string;
  description?: string;
  status: string;
  browserState: string;
  hasLoginCredentials: boolean;
  aiEnabled: boolean;
  aiPauseOnSensitive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const storeService = {
  list: () => api.get<{ data: Store[] }>('/stores'),
  get: (id: string) => api.get<{ data: Store }>(`/stores/${id}`),
  create: (data: { name: string; shopId?: string; description?: string }) =>
    api.post<{ data: Store }>('/stores', data),
  update: (id: string, data: { name?: string; shopId?: string; description?: string; aiEnabled?: boolean; aiPauseOnSensitive?: boolean }) =>
    api.put<{ data: Store }>(`/stores/${id}`, data),
  remove: (id: string) => api.delete(`/stores/${id}`),

  // PDD browser control
  connect: (storeId: string, storeName: string) =>
    api.post(`/pdd/stores/${storeId}/connect`, { storeName }),
  disconnect: (storeId: string) =>
    api.post(`/pdd/stores/${storeId}/disconnect`),
  getStatus: (storeId: string) =>
    api.get<{ data: { state: string; uptime: number; errorMessage?: string } }>(`/pdd/stores/${storeId}/status`),
};
