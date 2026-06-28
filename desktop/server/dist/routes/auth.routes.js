"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const validate_1 = require("../middleware/validate");
const auth_schema_1 = require("./schemas/auth.schema");
const router = (0, express_1.Router)();
// Brute-force protection on auth endpoints (per-IP fixed window).
const loginLimiter = (0, rateLimit_1.rateLimit)({ windowMs: 15 * 60 * 1000, max: 10, keySuffix: 'login', message: '登录尝试过于频繁，请 15 分钟后再试' });
const registerLimiter = (0, rateLimit_1.rateLimit)({ windowMs: 60 * 60 * 1000, max: 5, keySuffix: 'register', message: '注册过于频繁，请稍后再试' });
const refreshLimiter = (0, rateLimit_1.rateLimit)({ windowMs: 15 * 60 * 1000, max: 60, keySuffix: 'refresh' });
router.post('/register', registerLimiter, (0, validate_1.validate)(auth_schema_1.registerSchema), auth_controller_1.authController.register);
router.post('/login', loginLimiter, (0, validate_1.validate)(auth_schema_1.loginSchema), auth_controller_1.authController.login);
router.post('/refresh', refreshLimiter, auth_controller_1.authController.refresh);
router.post('/logout', auth_1.authMiddleware, auth_controller_1.authController.logout);
router.get('/me', auth_1.authMiddleware, auth_controller_1.authController.me);
router.patch('/me', auth_1.authMiddleware, auth_controller_1.authController.updateMe);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map