"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const license_service_1 = require("../services/license.service");
const rateLimit_1 = require("../middleware/rateLimit");
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// Throttle activation attempts (per-IP) so the code can't be brute-forced.
// Ed25519 forgery is infeasible anyway, but this bounds abuse cheaply.
const activateLimiter = (0, rateLimit_1.rateLimit)({ windowMs: 15 * 60 * 1000, max: 20, keySuffix: 'activate', message: '激活尝试过于频繁，请稍后再试' });
/**
 * GET /api/license/status
 * Public — the activation page calls this before the machine is activated.
 * Returns whether this machine is activated and its machine code (for display).
 */
router.get('/status', async (_req, res) => {
    try {
        const info = await license_service_1.licenseService.getActivationInfo();
        res.json({ data: { ...info, machineId: license_service_1.licenseService.getMachineId() } });
    }
    catch (e) {
        logger_1.default.error(`license status error: ${e?.message || e}`);
        res.status(500).json({ error: '获取激活状态失败' });
    }
});
/**
 * POST /api/license/activate  { code }
 * Public — verifies the activation code against this machine and persists it.
 */
router.post('/activate', activateLimiter, async (req, res) => {
    try {
        const code = typeof req.body?.code === 'string' ? req.body.code : '';
        const result = await license_service_1.licenseService.activate(code);
        if (!result.ok) {
            res.status(400).json({ error: result.error || '激活失败' });
            return;
        }
        res.json({ data: { activated: true } });
    }
    catch (e) {
        logger_1.default.error(`license activate error: ${e?.message || e}`);
        res.status(500).json({ error: '激活失败，请重试' });
    }
});
exports.default = router;
//# sourceMappingURL=license.routes.js.map