import api from './api';

export interface Product {
  id: string;
  storeId: string;
  externalId?: string | null;
  name: string;
  description?: string | null;
  price: number;
  stock: number;
  category?: string | null;
  productUrl?: string | null;
  imageUrls?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportResult {
  imported: number;
  failed: number;
  errors: { row: number; reason: string }[];
}

export interface ProductInput {
  name: string;
  price: number;
  stock?: number;
  category?: string | null;
  productUrl?: string | null;
  description?: string | null;
}

export const productService = {
  list: (storeId: string, params?: { search?: string; category?: string }) =>
    api.get<{ data: Product[] }>(`/stores/${storeId}/products`, { params }),

  create: (storeId: string, data: ProductInput) =>
    api.post<{ data: Product }>(`/stores/${storeId}/products`, data),

  update: (storeId: string, productId: string, data: Partial<ProductInput> & { status?: string }) =>
    api.put<{ data: Product }>(`/stores/${storeId}/products/${productId}`, data),

  remove: (storeId: string, productId: string) =>
    api.delete(`/stores/${storeId}/products/${productId}`),

  importExcel: (storeId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ data: ImportResult }>(`/stores/${storeId}/products/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Template download returns an .xlsx blob
  downloadTemplate: (storeId: string) =>
    api.get(`/stores/${storeId}/products/template`, { responseType: 'blob' }),

  // Export the whole catalog as an .xlsx blob
  exportAll: (storeId: string) =>
    api.get(`/stores/${storeId}/products/export`, { responseType: 'blob' }),

  // One-click sync from PDD — starts a BACKGROUND task, returns immediately.
  syncFromPdd: (storeId: string) =>
    api.post<{ data: SyncTask }>(`/stores/${storeId}/products/sync-from-pdd`),

  // Poll background sync progress.
  syncStatus: (storeId: string) =>
    api.get<{ data: SyncTask | null }>(`/stores/${storeId}/products/sync-status`),
};

export interface SyncTask {
  status: 'running' | 'done' | 'error';
  fetched: number;
  total: number;
  synced: number;
  failed: number;
  startedAt: number;
  finishedAt?: number;
  error: string | null;
}
