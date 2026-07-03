import api from './api';

export interface QAEntry {
  id: string;
  storeId: string;
  question: string;
  answer: string;
  keywords?: string | null;
  category?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QAInput {
  question: string;
  answer: string;
  keywords?: string | null;
  category?: string | null;
  enabled?: boolean;
}

export interface QAImportResult {
  imported: number;
  failed: number;
  errors: { row: number; reason: string }[];
}

export const qaService = {
  list: (storeId: string, params?: { search?: string; category?: string }) =>
    api.get<{ data: QAEntry[] }>(`/stores/${storeId}/qa`, { params }),

  create: (storeId: string, data: QAInput) =>
    api.post<{ data: QAEntry }>(`/stores/${storeId}/qa`, data),

  update: (storeId: string, qaId: string, data: Partial<QAInput>) =>
    api.put<{ data: QAEntry }>(`/stores/${storeId}/qa/${qaId}`, data),

  remove: (storeId: string, qaId: string) =>
    api.delete(`/stores/${storeId}/qa/${qaId}`),

  importExcel: (storeId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ data: QAImportResult }>(`/stores/${storeId}/qa/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Template / export both return an .xlsx blob
  downloadTemplate: (storeId: string) =>
    api.get(`/stores/${storeId}/qa/template`, { responseType: 'blob' }),

  exportAll: (storeId: string) =>
    api.get(`/stores/${storeId}/qa/export`, { responseType: 'blob' }),
};
