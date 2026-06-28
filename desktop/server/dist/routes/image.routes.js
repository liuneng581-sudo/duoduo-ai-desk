"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const image_controller_1 = require("../controllers/image.controller");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const router = (0, express_1.Router)();
// Image generation is costly (calls paid AI APIs) — throttle per user/IP.
const generateLimiter = (0, rateLimit_1.rateLimit)({ windowMs: 60_000, max: 10, keySuffix: 'img-gen', message: '图片生成过于频繁，请稍后再试' });
router.post('/generate', auth_1.authMiddleware, generateLimiter, image_controller_1.imageController.generate);
router.get('/history', auth_1.authMiddleware, image_controller_1.imageController.history);
router.delete('/:id', auth_1.authMiddleware, image_controller_1.imageController.remove);
exports.default = router;
//# sourceMappingURL=image.routes.js.map