"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const storeAccess_1 = require("../middleware/storeAccess");
const gateway_1 = require("../services/companion/gateway");
const express_2 = require("../types/express");
const store_service_1 = require("../services/store.service");
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
/**
 * GET /api/pdd/alerts
 * Pending alerts the owner should act on:
 *   - browser issues (login / captcha / connection error)
 *   - conversations the AI handed off to a human (status pending_human)
 * Both surface in the header bell so nothing is silently dropped — this is the
 * in-app signal that does NOT depend on Feishu being configured.
 */
router.get('/alerts', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const [stores, handoffs] = await Promise.all([
            database_1.default.store.findMany({
                where: { userId, browserState: { in: ['needs_login', 'needs_captcha', 'error'] } },
                select: { id: true, name: true, browserState: true },
            }),
            database_1.default.conversation.findMany({
                where: { status: 'pending_human', store: { userId } },
                select: { id: true, storeId: true, title: true, updatedAt: true, store: { select: { name: true } } },
                orderBy: { updatedAt: 'desc' },
                take: 50,
            }),
        ]);
        const storeAlerts = stores.map((s) => ({
            storeId: s.id,
            storeName: s.name,
            type: s.browserState === 'needs_login' ? 'needs_login' :
                s.browserState === 'error' ? 'error' : 'needs_captcha',
            message: s.browserState === 'needs_login' ? `店铺「${s.name}」需要在浏览器中登录` :
                s.browserState === 'error' ? `店铺「${s.name}」连接异常` :
                    `店铺「${s.name}」需要完成验证`,
            timestamp: new Date().toISOString(),
            acknowledged: false,
        }));
        const handoffAlerts = handoffs.map((c) => ({
            storeId: c.storeId,
            storeName: c.store?.name || '店铺',
            type: 'needs_human',
            conversationId: c.id,
            message: `有客户对话需要人工处理：${c.title || '点击查看'}`,
            timestamp: c.updatedAt.toISOString(),
            acknowledged: false,
        }));
        res.json({ data: [...handoffAlerts, ...storeAlerts] });
    }
    catch {
        res.json({ data: [] });
    }
});
/**
 * POST /api/pdd/alerts/:storeId/ack
 */
router.post('/alerts/:storeId/ack', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, async (req, res) => {
    const storeId = (0, express_2.param)(req, 'storeId');
    // Reset transient alert states back to idle so the alert stays dismissed.
    // 'error' is included so a stale connection-error alert can be cleared too
    // (previously only login/captcha were reset, leaving error alerts stuck).
    // Wrapped in try/catch: Express 4 does NOT forward async-handler rejections to
    // the error middleware, so a Prisma throw (e.g. SQLITE_BUSY) would otherwise
    // hang the request until socket timeout.
    try {
        const store = await database_1.default.store.findUnique({ where: { id: storeId }, select: { browserState: true } });
        if (store && ['needs_login', 'needs_captcha', 'error'].includes(store.browserState)) {
            await database_1.default.store.update({ where: { id: storeId }, data: { browserState: 'idle' } });
        }
        res.json({ message: '已确认' });
    }
    catch {
        res.status(500).json({ error: '操作失败，请重试' });
    }
});
/**
 * POST /api/pdd/stores/:storeId/connect
 * Tell companion to start a browser for this store.
 */
router.post('/stores/:storeId/connect', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, async (req, res) => {
    const storeId = (0, express_2.param)(req, 'storeId');
    const storeName = req.body?.storeName || `Store-${storeId}`;
    // Update DB state
    await database_1.default.store.update({ where: { id: storeId }, data: { browserState: 'connecting' } }).catch(() => { });
    // Get decrypted credentials to pass via WebSocket
    const credentials = await store_service_1.storeService.getCredentials(storeId);
    // Send command to companion (credentials delivered securely via WS, not REST)
    const sent = gateway_1.companionGateway.sendCommand(storeId, {
        type: 'start_store',
        storeName,
        credentials: credentials || undefined,
    });
    if (sent) {
        res.json({ message: '已发送启动指令', storeId });
    }
    else {
        res.status(503).json({ error: 'Companion 客户端未连接，请确认应用已启动' });
    }
});
/**
 * POST /api/pdd/stores/:storeId/disconnect
 */
router.post('/stores/:storeId/disconnect', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, async (req, res) => {
    const storeId = (0, express_2.param)(req, 'storeId');
    gateway_1.companionGateway.sendCommand(storeId, { type: 'stop_store' });
    await database_1.default.store.update({ where: { id: storeId }, data: { browserState: 'idle' } }).catch(() => { });
    res.json({ message: '已断开', storeId });
});
/**
 * GET /api/pdd/stores/:storeId/status
 */
router.get('/stores/:storeId/status', auth_1.authMiddleware, storeAccess_1.requireStoreAccess, async (req, res) => {
    const storeId = (0, express_2.param)(req, 'storeId');
    const store = await database_1.default.store.findUnique({
        where: { id: storeId },
        select: { browserState: true },
    });
    res.json({
        data: {
            state: store?.browserState || 'idle',
            uptime: 0,
            errorMessage: store?.browserState === 'error' ? '连接异常' : undefined,
        },
    });
});
exports.default = router;
//# sourceMappingURL=pdd.routes.js.map