"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeService = void 0;
const store_repository_1 = require("../repositories/store.repository");
const crypto_1 = require("../utils/crypto");
/** Strip sensitive fields and add hasLoginCredentials flag */
function sanitize(store) {
    if (!store)
        return store;
    const { loginAccount, loginPassword, ...rest } = store;
    return { ...rest, hasLoginCredentials: !!(loginAccount && loginPassword) };
}
exports.storeService = {
    async list(userId) {
        const stores = await store_repository_1.storeRepository.findByUser(userId);
        return stores.map(sanitize);
    },
    async get(id) {
        const store = await store_repository_1.storeRepository.findById(id);
        return sanitize(store);
    },
    create(userId, data) {
        const payload = { userId, name: data.name, shopId: data.shopId, description: data.description };
        if (data.loginAccount)
            payload.loginAccount = (0, crypto_1.encrypt)(data.loginAccount);
        if (data.loginPassword)
            payload.loginPassword = (0, crypto_1.encrypt)(data.loginPassword);
        return store_repository_1.storeRepository.create(payload).then(sanitize);
    },
    update(id, data) {
        const payload = {};
        if (data.name !== undefined)
            payload.name = data.name;
        if (data.shopId !== undefined)
            payload.shopId = data.shopId;
        if (data.description !== undefined)
            payload.description = data.description;
        if (data.aiEnabled !== undefined)
            payload.aiEnabled = data.aiEnabled;
        if (data.aiPauseOnSensitive !== undefined)
            payload.aiPauseOnSensitive = data.aiPauseOnSensitive;
        if (data.clearCredentials) {
            // Explicit clear
            payload.loginAccount = null;
            payload.loginPassword = null;
        }
        else if (data.loginAccount || data.loginPassword) {
            // Update credentials (only if new values provided)
            if (data.loginAccount)
                payload.loginAccount = (0, crypto_1.encrypt)(data.loginAccount);
            if (data.loginPassword)
                payload.loginPassword = (0, crypto_1.encrypt)(data.loginPassword);
        }
        // If neither clearCredentials nor new credentials, don't touch them
        return store_repository_1.storeRepository.update(id, payload).then(sanitize);
    },
    remove: (id) => store_repository_1.storeRepository.delete(id),
    updateBrowserState: (id, browserState) => store_repository_1.storeRepository.updateBrowserState(id, { browserState }),
    saveCookies: (id, cookieData) => store_repository_1.storeRepository.updateBrowserState(id, {
        cookieData,
        cookieExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }),
    /** Get decrypted credentials (internal — never exposed via REST) */
    async getCredentials(id) {
        const store = await store_repository_1.storeRepository.findById(id);
        if (!store || !store.loginAccount)
            return null;
        try {
            return {
                account: store.loginAccount ? (0, crypto_1.decrypt)(store.loginAccount) : '',
                password: store.loginPassword ? (0, crypto_1.decrypt)(store.loginPassword) : '',
            };
        }
        catch {
            return null;
        }
    },
};
//# sourceMappingURL=store.service.js.map