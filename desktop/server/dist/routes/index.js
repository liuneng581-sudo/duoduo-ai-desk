"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const license_routes_1 = __importDefault(require("./license.routes"));
const dashboard_routes_1 = __importDefault(require("./dashboard.routes"));
const chat_routes_1 = __importDefault(require("./chat.routes"));
const pdd_routes_1 = __importDefault(require("./pdd.routes"));
const ai_routes_1 = __importDefault(require("./ai.routes"));
const store_routes_1 = __importDefault(require("./store.routes"));
const settings_routes_1 = __importDefault(require("./settings.routes"));
const image_routes_1 = __importDefault(require("./image.routes"));
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
router.use('/auth', auth_routes_1.default);
router.use('/license', license_routes_1.default);
router.use('/dashboard', dashboard_routes_1.default);
router.use('/chat', chat_routes_1.default);
router.use('/pdd', pdd_routes_1.default);
router.use('/ai', ai_routes_1.default);
router.use('/stores', store_routes_1.default);
router.use('/settings', settings_routes_1.default);
router.use('/images', image_routes_1.default);
router.get('/health', async (_req, res) => {
    let dbOk = false;
    try {
        await database_1.default.$queryRaw `SELECT 1`;
        dbOk = true;
    }
    catch { }
    res.json({
        status: dbOk ? 'ok' : 'degraded',
        database: dbOk ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
    });
});
exports.default = router;
//# sourceMappingURL=index.js.map