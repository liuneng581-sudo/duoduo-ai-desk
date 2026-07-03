import { storeRepository } from '../repositories/store.repository';
import { encrypt, decrypt } from '../utils/crypto';

/** Strip sensitive fields and add hasLoginCredentials flag */
function sanitize(store: any) {
  if (!store) return store;
  const { loginAccount, loginPassword, ...rest } = store;
  return { ...rest, hasLoginCredentials: !!(loginAccount && loginPassword) };
}

export const storeService = {
  async list(userId: string) {
    const stores = await storeRepository.findByUser(userId);
    return stores.map(sanitize);
  },

  async get(id: string) {
    const store = await storeRepository.findById(id);
    return sanitize(store);
  },

  create(
    userId: string,
    data: { name: string; shopId?: string; description?: string; loginAccount?: string; loginPassword?: string },
  ) {
    const payload: any = { userId, name: data.name, shopId: data.shopId, description: data.description };
    if (data.loginAccount) payload.loginAccount = encrypt(data.loginAccount);
    if (data.loginPassword) payload.loginPassword = encrypt(data.loginPassword);
    return storeRepository.create(payload).then(sanitize);
  },

  update(
    id: string,
    data: { name?: string; shopId?: string; description?: string; loginAccount?: string; loginPassword?: string; clearCredentials?: boolean; aiEnabled?: boolean; aiPauseOnSensitive?: boolean },
  ) {
    const payload: any = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.shopId !== undefined) payload.shopId = data.shopId;
    if (data.description !== undefined) payload.description = data.description;
    if (data.aiEnabled !== undefined) payload.aiEnabled = data.aiEnabled;
    if (data.aiPauseOnSensitive !== undefined) payload.aiPauseOnSensitive = data.aiPauseOnSensitive;

    if (data.clearCredentials) {
      // Explicit clear
      payload.loginAccount = null;
      payload.loginPassword = null;
    } else if (data.loginAccount || data.loginPassword) {
      // Update credentials (only if new values provided)
      if (data.loginAccount) payload.loginAccount = encrypt(data.loginAccount);
      if (data.loginPassword) payload.loginPassword = encrypt(data.loginPassword);
    }
    // If neither clearCredentials nor new credentials, don't touch them

    return storeRepository.update(id, payload).then(sanitize);
  },

  remove: (id: string) => storeRepository.delete(id),

  updateBrowserState: (id: string, browserState: string) =>
    storeRepository.updateBrowserState(id, { browserState }),

  saveCookies: (id: string, cookieData: string) =>
    storeRepository.updateBrowserState(id, {
      cookieData,
      cookieExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }),

  /** Get decrypted credentials (internal — never exposed via REST) */
  async getCredentials(id: string): Promise<{ account: string; password: string } | null> {
    const store = await storeRepository.findById(id);
    if (!store || !(store as any).loginAccount) return null;
    try {
      return {
        account: (store as any).loginAccount ? decrypt((store as any).loginAccount) : '',
        password: (store as any).loginPassword ? decrypt((store as any).loginPassword) : '',
      };
    } catch {
      return null;
    }
  },
};
