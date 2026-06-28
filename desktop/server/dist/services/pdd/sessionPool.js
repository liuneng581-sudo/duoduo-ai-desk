"use strict";
/**
 * Multi-store session pool.
 *
 * Manages one browser session per store. Handles:
 * - Starting/stopping sessions
 * - Manual login detection + captcha notification
 * - Reconnection on failure
 * - Status monitoring
 * - Message routing to the AI engine
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionPool = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const database_1 = __importDefault(require("../../config/database"));
const browserManager_1 = require("./browserManager");
const wsInterceptor_1 = require("./wsInterceptor");
const sessions = new Map();
/** Callback for when a customer message is received */
let messageHandler = null;
let alertCallback = null;
/** In-memory alert store for polling */
const pendingAlerts = [];
exports.sessionPool = {
    // ============================================
    // Callback registration
    // ============================================
    /** Register the global message handler (connects to AI engine) */
    onMessage(handler) {
        messageHandler = handler;
    },
    /** Register an alert handler (for push notifications) */
    onAlert(handler) {
        alertCallback = handler;
    },
    /** Get all pending (unacknowledged) alerts */
    getAlerts() {
        return pendingAlerts.filter((a) => !a.acknowledged);
    },
    /** Acknowledge an alert */
    acknowledgeAlert(storeId) {
        const alert = pendingAlerts.find((a) => a.storeId === storeId && !a.acknowledged);
        if (alert)
            alert.acknowledged = true;
    },
    /** Internal: raise an alert */
    _alert(storeId, storeName, type, message) {
        logger_1.default.warn(`[${storeId}] ALERT [${type}]: ${message}`);
        const alert = { storeId, storeName, type, message, timestamp: new Date(), acknowledged: false };
        // Replace any existing unacknowledged alert for this store
        const existing = pendingAlerts.findIndex((a) => a.storeId === storeId && !a.acknowledged);
        if (existing >= 0) {
            pendingAlerts[existing] = alert;
        }
        else {
            pendingAlerts.push(alert);
        }
        // Fire callback if registered
        if (alertCallback) {
            alertCallback(storeId, storeName, type, message);
        }
    },
    // ============================================
    // Session lifecycle
    // ============================================
    /**
     * Start a browser session for a store.
     */
    async start(storeId, storeName) {
        if (sessions.has(storeId)) {
            logger_1.default.warn(`Session already exists for store ${storeId}`);
            return;
        }
        const session = {
            storeId,
            storeName,
            state: 'connecting',
            startedAt: new Date(),
        };
        sessions.set(storeId, session);
        // Update DB
        database_1.default.store.update({ where: { id: storeId }, data: { browserState: 'connecting' } }).catch(() => { });
        try {
            const { browser, context, page } = await browserManager_1.browserManager.launch(storeId);
            session.browser = browser;
            session.page = page;
            const { loggedIn } = await browserManager_1.browserManager.navigateToChat(page);
            if (!loggedIn) {
                // Browser stays open — user must manually log in
                session.state = 'needs_login';
                session.needsAttentionSince = new Date();
                session.errorMessage = '需要手动扫码/密码登录拼多多商家后台';
                database_1.default.store.update({ where: { id: storeId }, data: { browserState: 'needs_login' } }).catch(() => { });
                this._alert(storeId, storeName, 'needs_login', `店铺"${storeName}"需要登录拼多多商家后台。请在浏览器中扫码或输入密码完成登录。`);
                // Wait for login in background
                browserManager_1.browserManager.waitForLogin(page).then(async (success) => {
                    if (success) {
                        session.state = 'online';
                        session.needsAttentionSince = undefined;
                        session.errorMessage = undefined;
                        this.acknowledgeAlert(storeId);
                        await exports.sessionPool._afterLogin(session);
                    }
                });
                return;
            }
            await this._afterLogin(session);
        }
        catch (err) {
            session.state = 'error';
            session.errorMessage = err.message;
            database_1.default.store.update({ where: { id: storeId }, data: { browserState: 'error' } }).catch(() => { });
            this._alert(storeId, storeName, 'error', `店铺"${storeName}"启动失败: ${err.message}`);
            logger_1.default.error(`[${storeId}] Failed to start session: ${err.message}`);
        }
    },
    /** Called after successful login */
    async _afterLogin(session) {
        const { storeId, page } = session;
        if (!page)
            return;
        wsInterceptor_1.wsInterceptor.attach(page, storeId, (msg) => {
            session.lastMessageAt = new Date();
            if (messageHandler) {
                messageHandler(storeId, msg);
            }
            else {
                logger_1.default.warn(`[${storeId}] No message handler registered, dropping message`);
            }
        });
        session.state = 'online';
        session.needsAttentionSince = undefined;
        session.errorMessage = undefined;
        database_1.default.store.update({ where: { id: storeId }, data: { browserState: 'online' } }).catch(() => { });
        logger_1.default.info(`[${storeId}] ${session.storeName} is now online`);
    },
    /**
     * Stop a session.
     */
    async stop(storeId) {
        const session = sessions.get(storeId);
        if (!session)
            return;
        await browserManager_1.browserManager.close(session);
        sessions.delete(storeId);
        this.acknowledgeAlert(storeId);
        database_1.default.store.update({ where: { id: storeId }, data: { browserState: 'idle' } }).catch(() => { });
        logger_1.default.info(`[${storeId}] Session stopped`);
    },
    /**
     * Send a reply to a specific conversation in a store.
     */
    async sendReply(storeId, conversationId, content) {
        return wsInterceptor_1.wsInterceptor.sendReply(storeId, { conversationId, content });
    },
    /**
     * Get status of all sessions.
     */
    getStatuses() {
        return Array.from(sessions.values()).map((s) => ({
            storeId: s.storeId,
            storeName: s.storeName,
            state: s.state,
            uptime: Math.floor((Date.now() - s.startedAt.getTime()) / 1000),
            messageCount: 0,
            lastMessageAt: s.lastMessageAt,
            errorMessage: s.errorMessage,
        }));
    },
    /**
     * Get a single session status.
     */
    getStatus(storeId) {
        const s = sessions.get(storeId);
        if (!s)
            return null;
        return {
            storeId: s.storeId,
            storeName: s.storeName,
            state: s.state,
            uptime: Math.floor((Date.now() - s.startedAt.getTime()) / 1000),
            messageCount: 0,
            lastMessageAt: s.lastMessageAt,
            errorMessage: s.errorMessage,
        };
    },
    /**
     * Check if a session is online.
     */
    isOnline(storeId) {
        return sessions.get(storeId)?.state === 'online';
    },
};
//# sourceMappingURL=sessionPool.js.map