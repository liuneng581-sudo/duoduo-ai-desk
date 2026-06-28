"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const license_service_1 = require("../services/license.service");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Activation gate (replaces JWT login).
 *
 * This is a single-machine, license-activated desktop app — there is no account
 * login. Access is gated on whether THIS machine is activated. When it is, we
 * attach the single license-owner user to req.user, so every downstream handler
 * that reads req.user.userId keeps working unchanged.
 *
 * Unactivated requests get 401 with code NOT_ACTIVATED, which the client maps to
 * the activation page.
 */
async function authMiddleware(req, res, next) {
    try {
        const activated = await license_service_1.licenseService.isActivated();
        if (!activated) {
            res.status(401).json({ error: '应用未激活', code: 'NOT_ACTIVATED' });
            return;
        }
        const userId = await license_service_1.licenseService.ensureOwnerUser();
        req.user = { userId, email: 'owner@local', role: 'admin' };
        next();
    }
    catch (error) {
        logger_1.default.warn('Activation check failed', { error: error?.message || error });
        res.status(401).json({ error: '应用未激活', code: 'NOT_ACTIVATED' });
    }
}
//# sourceMappingURL=auth.js.map