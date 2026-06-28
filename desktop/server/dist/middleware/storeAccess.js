"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireStoreAccess = requireStoreAccess;
const database_1 = __importDefault(require("../config/database"));
const express_1 = require("../types/express");
/**
 * Middleware to verify the authenticated user owns the store specified in :storeId.
 * Must be used after authMiddleware.
 */
async function requireStoreAccess(req, res, next) {
    const storeId = (0, express_1.param)(req, 'storeId');
    if (!storeId) {
        res.status(400).json({ error: '缺少店铺 ID' });
        return;
    }
    try {
        const store = await database_1.default.store.findUnique({
            where: { id: storeId },
            select: { userId: true },
        });
        if (!store) {
            res.status(404).json({ error: '店铺不存在' });
            return;
        }
        if (store.userId !== req.user?.userId) {
            res.status(403).json({ error: '无权访问此店铺' });
            return;
        }
        next();
    }
    catch (err) {
        // A DB error here (e.g. SQLite SQLITE_BUSY under concurrent writes) would
        // otherwise reject silently and hang the request — Express 4 does not catch
        // async middleware rejections. Forward to the error handler.
        next(err);
    }
}
//# sourceMappingURL=storeAccess.js.map