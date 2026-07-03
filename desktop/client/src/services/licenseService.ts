import api from './api';

export interface LicenseStatus {
  activated: boolean;
  machineId: string;
  plan?: 'permanent' | 'trial' | 'expired' | 'none';
  days?: number;
  expiresAt?: string | null;
  remainingDays?: number | null;
}

export const licenseService = {
  status: () => api.get<{ data: LicenseStatus }>('/license/status'),
  activate: (code: string) => api.post<{ data: { activated: boolean } }>('/license/activate', { code }),
};
